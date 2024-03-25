const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database'); // Adjust the path as necessary
const { logger } = require('../utilities/logger');
const { isAuthenticated } = require('../middleware/isAuthenticated');

const router = express.Router();

router.post('/login', async (req, res) => {
	const { email, password } = req.body;

	try {
		// Retrieve user from the database
		const query = 'SELECT * FROM `fx_users` WHERE email = ?';
		const users = await db.query(query, [email]);

		if (users.length === 0) {
			return res.status(401).send({ message: 'Login failed', code: 'LOGIN_FAILED' });
		}

		// throw new Error('just for fun');

		const user = users[0];

		const q = 'SELECT * FROM `products` WHERE id = ?';
		const products = await db.query(q, [user.plan]);

		const currentPlanData = products?.at(0) ?? null;

		// Check profile status
		if (user.profile_status === 'Dormant') {
			return res.status(403).send({ message: 'Account is dormant. Please contact support.', code: 'ACCOUNT_DORMANT' });
		}
		// else if (user.profile_status === 'Verification Pending') {
		// 	return res.status(403).send({ message: 'Please verify your account.', code: 'ACCOUNT_PENDING_VERIFICATION' });
		// }

		// Verify password
		const match = await bcrypt.compare(password, user.password);

		if (match) {
			// Generate JWT
			const token = jwt.sign({ id: user.member_id, role: user.user_role }, process.env.JWT_SECRET, { expiresIn: '1h' });

			res.send({
				message: 'Login successful',
				token,
				currentPlanData,
				...{
					email: user.email,
					id: user.member_id,
					firstName: user.first_name,
					lastName: user.last_name,
					role: user.user_role,
					username: user.first_name,
					profile_status: user.profile_status,
					mobileNumber: user.mobile_number,
					secondaryPhone: user.secondary_phone_number,
					address: user.address,
					dateOfBirth: user.date_of_birth,
					nationalIdentityNumber: user.national_identity_number,
					registrationDate: user.registration_date,
					introducer: user.introducer,
					salesSummary: user.sales_sum,
					debitCount: user.debit_count,
					introCount: user.intro_count,
					firstSalesAmount: user.first_sale_amount,
					cashBack: user.cash_back,
					currentPlan: user.plan,
					referralType: user.referral_type,
					directSaleCommission: user.direct_sales,
					binaryCommission: user.binary_commission,
					currentBalance: user.current_balance,
					totalEarnings: user.total_earnings,
					totalWithdrawals: user.total_withdrawals,
				},
			});
		} else {
			res.status(401).send({ message: 'Login failed', code: 'LOGIN_FAILED' });
		}
	} catch (error) {
		logger.error('Login error:', error);
		res.status(500).send({ message: 'Internal server error', code: 'SERVER_ERROR' });
	}
});

router.get('/user/:userId', isAuthenticated, async (req, res) => {
	const { userId } = req.params;

	if (userId === undefined)
		return res.json(400).json({ success: false, message: 'Required parameters cannot be empty.' });

	if (req.locals.id !== userId)
		return res.status(401).json({ success: false, message: 'You cannot access user data other than yours' });

	const q = await db.query('SELECT * FROM fx_users WHERE member_id = ?', [userId]);
	if (q.length <= 0) return res.json(400).json({ success: false, message: 'Request user cannot be found.' });

	const user = q[0];
	const data = {
		email: user.email,
		id: user.member_id,
		firstName: user.first_name,
		lastName: user.last_name,
		role: user.user_role,
		username: user.first_name,
		profile_status: user.profile_status,
		mobileNumber: user.mobile_number,
		secondaryPhone: user.secondary_phone_number,
		address: user.address,
		dateOfBirth: user.date_of_birth,
		nationalIdentityNumber: user.national_identity_number,
		registrationDate: user.registration_date,
		introducer: user.introducer,
		salesSummary: user.sales_sum,
		debitCount: user.debit_count,
		introCount: user.intro_count,
		firstSalesAmount: user.first_sale_amount,
		cashBack: user.cash_back,
		currentPlan: user.plan,
		referralType: user.referral_type,
		directSaleCommission: user.direct_sales,
		binaryCommission: user.binary_commission,
		currentBalance: user.current_balance,
		totalEarnings: user.total_earnings,
		totalWithdrawals: user.total_withdrawals,
	};

	res.json({
		time: Date.now(),
		...data,
	});
});

module.exports = router;
