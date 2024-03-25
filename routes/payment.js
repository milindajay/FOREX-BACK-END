const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { generateBinancePayHeaders } = require('../utilities/binancePayUtils');
const { logger } = require('../utilities/logger');
require('dotenv').config();
const router = express.Router();
const db = require('../database');
const { transporter } = require('../mailer');
const { isAuthenticated } = require('../middleware/isAuthenticated');

const ADMINISTRATION_AND_ONE_YEAR_SIGNAL_FEE = 15;
const STRIPE_PROCESSING_FEE_PERCENTAGE = 4.2 / 100;

const DIRECT_COMMISSION_PERCENTAGE = 10 / 100;
const CASH_BACK_BONUS_PERCENTAGE = 19 / 100;
const REFERRAL_POINT_USD_VALUE = 3;

function calculateTotalCharge(productPrice) {
	const flatFee = 1.0;

	return Math.ceil((productPrice + flatFee) / (1 - STRIPE_PROCESSING_FEE_PERCENTAGE));
}

// A one-time bonus when a member reaches 1:1 referrals on both sides
async function addCashBackBonus(member_id, sp_A, sp_B, current_balance, cash_back, total_earnings) {
	const sideAReferralPoints = parseFloat(sp_A) ?? 0;
	const sideBReferralPoints = parseFloat(sp_B) ?? 0;
	const currentCashBackValue = cash_back ?? 0;

	const isEligible = sideAReferralPoints >= 1 && sideBReferralPoints >= 1 && currentCashBackValue === 0;

	if (isEligible) {
		// Get starter plan data
		const result = await db.query('SELECT * FROM products WHERE id = 1');
		if (result.length <= 0) throw Error('Failed to add cash back bonus because plan data cannot be found.');

		const planData = result[0];

		// plan price is multiplied by 2 to select 1:1 referral points from both sp_A and sp_B sides
		const bonus = planData.product_price * 2 * CASH_BACK_BONUS_PERCENTAGE;

		const currentBalance = current_balance ?? 0;
		const updatedCurrentBalance = currentBalance + bonus;

		const totalEarnings = total_earnings ?? 0;
		const updatedTotalEarnings = totalEarnings + bonus;

		await db.query('UPDATE fx_users SET cash_back = ?, current_balance = ?, total_earnings = ? WHERE member_id = ?', [
			bonus,
			updatedCurrentBalance,
			updatedTotalEarnings,
			member_id,
		]);

		await db.query('INSERT INTO sales_summary(commission_type, member_id, amount) VALUES (?, ?, ?)', [
			'Cash Back',
			member_id,
			bonus,
		]);
	}
}

async function addReferralBonuses(member_id, sp_A, sp_B, current_balance, binary_commission, total_earnings) {
	const eligibleReferralPoints = Math.floor(Math.min(parseFloat(sp_A), parseFloat(sp_B)));
	const isEligible = eligibleReferralPoints >= 1;

	const currentBalance = current_balance ?? 0;
	const totalEarnings = total_earnings ?? 0;
	if (isEligible) {
		const updatedSpA = sp_A - eligibleReferralPoints;
		const updatedSpB = sp_B - eligibleReferralPoints;

		// Eligible referral bonus is multiplied by 2 to select referral points from both sp_A and sp_B sides
		const bonus = eligibleReferralPoints * 2 * REFERRAL_POINT_USD_VALUE;

		const updatedCurrentBalance = currentBalance + bonus;
		const updatedBinaryComission = binary_commission + bonus;

		const updatedTotalEarnings = totalEarnings + bonus;

		await db.query(
			'UPDATE fx_users SET binary_commission = ?, sp_A = ?, sp_B = ?, current_balance = ?, total_earnings = ? WHERE member_id = ?',
			[updatedBinaryComission, updatedSpA, updatedSpB, updatedCurrentBalance, updatedTotalEarnings, member_id]
		);

		await db.query('INSERT INTO sales_summary(commission_type, member_id, amount) VALUES (?, ?, ?)', [
			'Binary Commission',
			member_id,
			bonus,
		]);

		return { updatedCurrentBalance, updatedTotalEarnings, bonus, updatedSpA, updatedSpB };
	}
	return {
		updatedCurrentBalance: currentBalance,
		updatedTotalEarnings: totalEarnings,
		bonus: 0,
		updatedSpA: sp_A,
		updatedSpB: sp_B,
	};
}

async function addReferralPointsToParents(referral_points, current_user_id, parentLinkingReferralType, level = 1) {
	const output = { modifiedMembers: [], level };
	const referralSide = parentLinkingReferralType === 'A' ? 'referral_side_A_member_id' : 'referral_side_B_member_id';
	const referralPointsSide = parentLinkingReferralType === 'A' ? 'sp_A' : 'sp_B';
	const otherReferralPointsSide = parentLinkingReferralType === 'B' ? 'sp_A' : 'sp_B';

	const q = await db.query(`SELECT * FROM fx_users WHERE ${referralSide} = ?`, [current_user_id]);

	if (q.length > 0) {
		const parent = q[0];

		if (parent.profile_status === 'Activated') {
			const currentReferralPoints = parent[referralPointsSide] ?? 0;
			const updatedReferralPoints = currentReferralPoints + referral_points;

			await db.query(`UPDATE fx_users SET ${referralPointsSide} = ? WHERE member_id = ?`, [
				updatedReferralPoints,
				parent.member_id,
			]);

			output.modifiedMembers.push(parent.member_id);

			const obj = {};
			obj[referralPointsSide] = updatedReferralPoints;
			obj[otherReferralPointsSide] = parent[otherReferralPointsSide] ?? 0;

			// ! Awaiting these will degrade performance
			const { updatedCurrentBalance, updatedTotalEarnings } = await addReferralBonuses(
				parent.member_id,
				obj.sp_A,
				obj.sp_B,
				parent.current_balance,
				parent.binary_commission,
				parent.total_earnings
			);
			await addCashBackBonus(
				parent.member_id,
				obj.sp_A,
				obj.sp_B,
				updatedCurrentBalance,
				parent.cash_back,
				updatedTotalEarnings
			);
		}

		const data = await addReferralPointsToParents(referral_points, parent.member_id, parent.referral_type, level + 1);
		output.modifiedMembers.push(...data.modifiedMembers);
		output.level = data.level;
	}

	return output;
}

const addDirectCommissionToIntroducer = async (introducer_id, plan_price) => {
	const directCommission = parseInt(plan_price) * DIRECT_COMMISSION_PERCENTAGE;

	const data = await db.query('SELECT * FROM fx_users WHERE member_id = ?', [introducer_id]);
	if (data.length <= 0) throw new Error('Introducer cannot be found when adding direct commission.');

	const introducer = data[0];
	if (introducer.profile_status === 'Activated') {
		const currentDirectSales = parseInt(introducer.direct_sales);
		const updatedDirectSales = currentDirectSales + directCommission;

		const currentBalance = introducer.current_balance ?? 0;
		const updatedCurrentBalance = currentBalance + directCommission;

		const totalEarnings = introducer.total_earnings ?? 0;
		const updatedTotalEarnings = totalEarnings + directCommission;

		await db.query(
			'UPDATE fx_users SET direct_sales = ?, current_balance = ?, total_earnings = ? WHERE member_id = ?',
			[updatedDirectSales, updatedCurrentBalance, updatedTotalEarnings, introducer.member_id]
		);

		await db.query('INSERT INTO sales_summary(commission_type, member_id, amount) VALUES (?, ?, ?)', [
			'Direct Sales Commission',
			introducer_id,
			directCommission,
		]);
	}
};

async function updatePaymentData(member_id, payment_intent, amount, plan, paymentMethod = 'STRIPE') {
	const q = await db.query('SELECT * FROM products WHERE id = ?', [plan]);
	if (q.length <= 0) throw new Error('Plan with given id cannot be found.');

	const planData = q[0];

	const q1 = await db.query('SELECT * FROM fx_users WHERE member_id = ?', [member_id]);
	if (q1.length <= 0) throw new Error('User with given id cannot be found.');

	const user = q1[0];

	// TODO : More payment verification required

	await db.query('UPDATE `fx_users` SET profile_status = ?, activation_date = NOW(), plan = ? WHERE member_id = ?', [
		'Activated',
		parseInt(plan),
		member_id,
	]);

	if (paymentMethod === 'STRIPE') {
		await db.query('INSERT INTO transactions(amount, payment_intent, member_id, plan, status) VALUES (?, ?, ?, ?, ?)', [
			parseFloat(amount),
			payment_intent,
			member_id,
			parseInt(plan),
			'Verified',
		]);
	}

	// if plan id equals to 1 (Starter plan), add the direct commission to the introducer.
	if (parseInt(plan) === 1) await addDirectCommissionToIntroducer(user.introducer, planData.product_price);

	const data = await addReferralPointsToParents(parseInt(planData.referral_points), user.member_id, user.referral_type);
}

// Stripe payment endpoint
router.get('/get-products/:currentPlan', isAuthenticated, async (req, res) => {
	const { currentPlan } = req.params;

	const isCurrentPlanAnInteger = Number.isInteger(parseInt(currentPlan));

	const plan = isCurrentPlanAnInteger ? parseInt(currentPlan) + 1 : 1;
	const result = await db.query('SELECT * FROM products WHERE id = ?', [plan]);

	const planData = result[0];

	const administrationFee = isCurrentPlanAnInteger ? 0 : ADMINISTRATION_AND_ONE_YEAR_SIGNAL_FEE;

	const total = planData.product_price + administrationFee;

	const fullTotal = calculateTotalCharge(total);

	res.json({
		...planData,
		administrationFee,
		total,
		stripeTotal: fullTotal * 100,
	});
});

router.post('/create-payment-intent', async (req, res) => {
	const { firstName, lastName, email, address, amount, description } = req.body; // 'source' is the token id generated by Stripe on the frontend
	try {
		const customer = await stripe.customers.create({ name: `${firstName} ${lastName}`, email });

		const paymentIntent = await stripe.paymentIntents.create({
			amount: amount,
			currency: 'usd',
			description: 'Forex Trading Master Course, including Administration Fee and 1-Year Signal Service.',
			automatic_payment_methods: {
				enabled: true,
			},
			customer: customer.id,
		});
		res.json({ success: true, clientSecret: paymentIntent.client_secret });
	} catch (error) {
		logger.error('Stripe Charge Error:', error);
		res.status(500).json({ success: false, error: error.message });
	}
});

router.get('/verify-payment', async (req, res) => {
	const {
		payment_intent,
		payment_intent_client_secret,
		redirect_status,
		member_id,
		introducer,
		plan,
		referral_points,
		referral_type,
		amount,
	} = req.query;

	try {
		await updatePaymentData(member_id, payment_intent, amount, plan);

		res.json({ success: true });
	} catch (error) {
		console.error(error);
		res.json({ status: 500, message: error.message });
	}
});

router.get('/verify-binance-payment', async (req, res) => {
	try {
		const { transaction_id, member_id, amount, plan_id, accepted } = req.query;

		if (
			transaction_id === undefined ||
			member_id === undefined ||
			amount === undefined ||
			plan_id === undefined ||
			accepted === undefined
		)
			throw new Error('Required request query attributes not found.');

		const q = await db.query('SELECT * FROM transactions WHERE payment_intent= ?', [transaction_id]);
		if (q.length <= 0)
			return res.status(404).json({ success: false, message: 'A transaction with the given transation id not found.' });

		const selectedTransaction = q[0];
		if (selectedTransaction.status !== 'Pending')
			return res.status(422).json({ success: false, message: 'Selected transaction is already verified or rejected.' });

		if (accepted === 'true') {
			await db.query('UPDATE transactions SET status = ? WHERE payment_intent= ?', [
				'Verified',
				selectedTransaction.payment_intent,
			]);

			await updatePaymentData(member_id, transaction_id, amount, plan_id, 'BINANCE');
			res.json({ success: true });
		} else {
			const q = await db.query('SELECT email FROM fx_users WHERE member_id = ?', [member_id]);
			if (q.length <= 0)
				throw new Error('Failed to reject binance payment. User with given member_id cannot be found.');

			const user = q[0];

			await db.query('UPDATE transactions SET status = ? WHERE payment_intent= ?', [
				'Rejected',
				selectedTransaction.payment_intent,
			]);
			const mailOptions = {
				from: process.env.SMTP_USER,
				to: user.email,
				subject: 'Payment Rejection Notification',
				html: `
				<p>We regret to inform you that your recent payment attempt has been rejected. Here are the details of the transaction:</p>

				<ul>
					<li>Amount: ${amount}</li>
					<li>Member ID: ${member_id}</li>
					<li>Transaction ID: ${transaction_id}</li>
				</ul>

				<p>To resolve this issue, please check your payment information for any inaccuracies or consider using an alternative payment method.</p>

				<p>For further assistance or to discuss other payment options, please feel free to contact our support team at <a href="mailto:support@forexcellencenet.com">support@forexcellencenet.com</a>.

				<p>We appreciate your prompt attention to this matter and look forward to assisting you.</p>
				<br/>
				<br/>
				<p>Best regards,</p>
				<p>Forexcellence Team</p>
				`,
			};

			transporter.sendMail(mailOptions);
			logger.info('payment rejection email sent.');
			res.json({ success: true });
		}
	} catch (error) {
		logger.error('Failed to verify binance payment:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

router.post('/binance-payment-completed', async (req, res) => {
	try {
		const { trx, member_id, amount, plan_id } = req.body;

		if (trx === undefined || member_id === undefined || amount === undefined || plan_id === undefined)
			throw new Error('Required request body attributes not found.');

		const serverUrl = new URL(`${req.protocol}:\/\/${req.get('host')}${req.originalUrl}`);
		const acceptVerificationLink = `${serverUrl.origin}/api/payment/verify-binance-payment?transaction_id=${trx}&member_id=${member_id}&amount=${amount}&plan_id=${plan_id}&accepted=true`;
		const rejectVerificationLink = `${serverUrl.origin}/api/payment/verify-binance-payment?transaction_id=${trx}&member_id=${member_id}&amount=${amount}&plan_id=${plan_id}&accepted=false`;

		const mailOptions = {
			from: process.env.SMTP_USER,
			to: process.env.BINANCE_PAYMENT_VERIFY_EMAIL,
			cc: [process.env.BINANCE_PAYMENT_SECOND_VERIFY_EMAIL],
			subject: 'Verify Binance Payment',
			html: `
			<p>You have received a Payment of ${amount} USDT from ${member_id}, Transaction ID is ${trx}. Plan ${plan_id}</p>
			<br/>
			<br/>
			<p>To Verify Payment, click here : <a href="${acceptVerificationLink}">${acceptVerificationLink}</a></p>
			<p>To Reject Payment, click here : <a href="${rejectVerificationLink}">${rejectVerificationLink}</a></p>`,
		};

		await db.query('INSERT INTO transactions(amount, payment_intent, member_id, plan, status) VALUES (?, ?, ?, ?, ?)', [
			parseFloat(amount),
			trx,
			member_id,
			parseInt(plan_id),
			'Pending',
		]);

		transporter.sendMail(mailOptions);
		logger.info('Email to verify binance payment sent.');
		res.json({ success: true });
	} catch (error) {
		logger.error('Failed to send email to verify binance payment:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

router.get('/complete-withdrawal-request', async (req, res) => {
	const { transaction_id, member_id, withdrawal_amount, wallet_address, accepted } = req.query;

	try {
		if (
			transaction_id === undefined &&
			member_id === undefined &&
			withdrawal_amount === undefined &&
			wallet_address === undefined &&
			accepted === undefined
		)
			return res.status(400).json({ success: false, message: 'Required paramters cannot be empty' });

		const q = await db.query('SELECT * FROM withdrawals WHERE id = ?', [transaction_id]);
		if (q.length <= 0)
			return res.status(400).json({ success: false, message: 'Withdrawal request with given id cannot be found.' });

		const withdrawalRequest = q[0];

		if (withdrawalRequest.status !== 'Pending')
			return res
				.status(422)
				.json({ success: false, message: 'Selected withdrawal request is already verified or rejected.' });

		const q1 = await db.query('SELECT * FROM fx_users WHERE member_id = ?', [member_id]);
		if (q1.length <= 0)
			return res.status(400).json({ success: false, message: 'User with given member_id cannot be found.' });

		const user = q1[0];

		const mailOptions = {
			from: process.env.SMTP_USER,
			to: user.email,
			subject: 'Withdrawal Request completed',
			html: `
				<p>Dear ${user.first_name}</p>

				<p>Your withdrawal request of USDT ${withdrawalRequest.amount} has been completed.</p>

				<br/>
				<br/>
				<p>Best regards,</p>
				<p>Forexcellence Team</p>
				`,
		};

		transporter.sendMail(mailOptions);

		await db.query('UPDATE withdrawals SET status = ? WHERE id = ?', ['Completed', transaction_id]);

		return res.json({ success: true });
	} catch (error) {
		logger.error('Failed to complete withdrawal request:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

router.post('/withdraw', async (req, res) => {
	const { member_id, withdrawalAmount, walletAddress } = req.body;

	try {
		if (member_id === undefined || withdrawalAmount === undefined || walletAddress === undefined)
			return res.status(400).json({ message: 'Required attributes cannot be empty' });

		const totalWithdrawalAmount = withdrawalAmount * (106 / 100);

		const q = await db.query('SELECT * FROM fx_users WHERE member_id = ?', [member_id]);
		if (q.length <= 0)
			return res.status(404).json({ success: false, message: 'User with given member id cannot be found.' });

		const user = q[0];
		const currentBalance = user.current_balance ?? 0;
		const currentTotalWithdrawals = user.total_withdrawals ?? 0;

		if (currentBalance <= totalWithdrawalAmount)
			return res
				.status(400)
				.json({ message: 'You cannot enter a withdrawal amount equal or lesser than the current balance.' });

		const updatedCurrentBalance = currentBalance - withdrawalAmount;
		const updatedTotalWithdrawals = currentTotalWithdrawals + withdrawalAmount;

		const result = await db.query(
			'INSERT INTO withdrawals(member_id, amount, status, wallet_address) VALUES (?, ?, ?, ?)',
			[member_id, withdrawalAmount, 'Pending', walletAddress]
		);

		const serverUrl = new URL(`${req.protocol}:\/\/${req.get('host')}${req.originalUrl}`);
		const acceptVerificationLink = `${serverUrl.origin}/api/payment/complete-withdrawal-request?transaction_id=${result.insertId}&member_id=${member_id}&withdrawal_amount=${withdrawalAmount}&wallet_address=${walletAddress}&accepted=true`;

		const mailOptions = {
			from: process.env.SMTP_USER,
			to: process.env.BINANCE_PAYMENT_VERIFY_EMAIL,
			cc: [process.env.BINANCE_PAYMENT_SECOND_VERIFY_EMAIL],
			subject: `Withdrawal Request from ${user.first_name} - ID ${member_id}`,
			html: `
				<p>You have received withdrawal request of ${withdrawalAmount.toFixed(5)} USD from ${user.first_name} ${
				user.last_name
			} - Member ID ${member_id}. Details as follows</p>

				<ul>
					<li>Withdrawal Amount: ${withdrawalAmount.toFixed(5)} USD (${totalWithdrawalAmount.toFixed(
				5
			)} USD including withdrawal charges)</li>
					<li>Member ID: ${member_id}</li>
					<li>Wallet Address: ${walletAddress}</li>
					<li>Transaction ID: ${result.insertId}</li>
					<li>Current Wallet Balance: ${currentBalance}</li>
				</ul>

				<p>Click below link to complete withdrawal request</p>
				<a href="${acceptVerificationLink}">Complete Withdrawal Request</a>.`,
		};

		await db.query('UPDATE fx_users SET current_balance = ?, total_withdrawals = ? WHERE member_id = ?', [
			updatedCurrentBalance,
			updatedTotalWithdrawals,
			member_id,
		]);

		transporter.sendMail(mailOptions);
		res.json({ success: true, message: 'Withdraw request created successfully.' });
	} catch (error) {
		logger.error('Failed to complete the withdraw request:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

// Binance Pay payment endpoint (Corrected and updated version)
router.post('/binancepay', async (req, res) => {
	const requestBody = JSON.stringify(req.body);
	const apiKey = process.env.BINANCE_PAY_CERTIFICATE_SN;
	const secretKey = process.env.BINANCE_PAY_SECRET_KEY;

	try {
		const headers = generateBinancePayHeaders(apiKey, secretKey, requestBody);

		// Ensure you're using the correct Binance Pay URL and endpoint
		const response = await axios.post('https://bpay.binanceapi.com/binancepay/openapi/v1/order', requestBody, {
			headers,
		});
		res.json(response.data);
	} catch (error) {
		logger.error('Error making Binance Pay request:', error.response ? error.response.data : error);
		res.status(500).json({ message: 'Failed to process payment with Binance Pay' });
	}
});

module.exports = router;
