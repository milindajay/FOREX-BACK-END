const express = require('express');
const bcrypt = require('bcrypt');
const { query } = require('../database'); // Ensure this points to your promisified query function
const {
	sendVerificationEmail,
	generateMemberId,
	generateVerificationToken,
	// generateReferralLink,
	// updateReferralLinks, // Assuming this function updates referral links in the user's record
} = require('../utilities/utils');
const { logger } = require('../utilities/logger');
const router = express.Router();

async function checkForAParentNode(referralSide, assumedParentMemberId) {
	const data = await query(`SELECT * FROM \`fx_users\` WHERE member_id = ?`, [assumedParentMemberId]);

	if (data.length > 0) {
		const assumedParentMember = data[0];
		const directChildMember = assumedParentMember[referralSide];

		if (directChildMember === null) {
			// assumedParentMember doesn't have referral children, so his member_id will be returned.
			return assumedParentMember.member_id;
		}

		return checkForAParentNode(referralSide, directChildMember);
	}

	throw new Error('Assumed parent member cannot be found.');
}

async function linkMemberToAParentNode(referral_type, member_id, introducer_id) {
	const referralSide = referral_type === 'A' ? 'referral_side_A_member_id' : 'referral_side_B_member_id';

	const data = await query(`SELECT * FROM \`fx_users\` WHERE member_id = ?`, [introducer_id]);
	if (data.length > 0) {
		const introducer = data[0];

		// check if required referral side is null
		const directChildMember = introducer[referralSide];
		if (directChildMember === null) {
			// introducer doesn't have referral children, so member will be allocated to the relevant side of the introducer
			await query(`UPDATE \`fx_users\` SET ${referralSide} = ? WHERE member_id = ?`, [member_id, introducer_id]);
			return introducer_id;
		}

		// referral side of the introducer is not null, that means there is already a direct member associated with the introducer.
		const parentMemberId = await checkForAParentNode(referralSide, directChildMember);
		if (parentMemberId) {
			// a parent with no direct referral members found. so the member will be allocated to the relevant side of the parent member.
			await query(`UPDATE \`fx_users\` SET ${referralSide} = ? WHERE member_id = ?`, [member_id, parentMemberId]);
			return parentMemberId;
		}

		throw new Error('Error occurred when checking for a parent node.');
	}

	throw new Error('Introducer cannot be found.');
}

router.post('/register', async (req, res) => {
	try {
		const {
			introducer, // This is expected to be the member_id of the introducer, if any
			firstName,
			lastName,
			email,
			mobileNumber,
			secondaryPhoneNumber,
			address,
			nationalIdentityNumber,
			dateOfBirth,
			nationality,
			password,
			referral_type, // Capture the referral type from the request
		} = req.body;

		const isRequiredAttributesAvailable =
			introducer && firstName && lastName && email && password && referral_type && nationalIdentityNumber;
		if (!isRequiredAttributesAvailable)
			return res.status(400).json({ success: false, message: 'Required attributes cannot be empty.' });

		// Check for duplicate email or national identity number
		const existingUserCheck = await query(
			'SELECT * FROM `fx_users` WHERE `email` = ? OR `national_identity_number` = ? LIMIT 1',
			[email, nationalIdentityNumber]
		);

		if (existingUserCheck.length > 0) {
			return res.status(400).send({ message: 'Email or National Identity Number already exists.' });
		}

		const hashedPassword = await bcrypt.hash(password, 10);
		const member_id = await generateMemberId(); // Ensure this aligns with your ID generation logic
		const verificationToken = generateVerificationToken(email);
		const parentMemberId = await linkMemberToAParentNode(referral_type, member_id, introducer);

		// Insert the new user into the database, now including referral_type
		const q = await query(
			'INSERT INTO `fx_users` (introducer, first_name, last_name, email, mobile_number, secondary_phone_number, address, national_identity_number, date_of_birth, nationality, password, member_id, verification_token, referral_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
			[
				introducer,
				firstName,
				lastName,
				email,
				mobileNumber,
				secondaryPhoneNumber,
				address,
				nationalIdentityNumber,
				dateOfBirth,
				nationality,
				hashedPassword,
				member_id,
				verificationToken,
				referral_type,
			]
		);

		// Link the member to a parent node

		// Generate referral links for the new user using their member_id
		// const referralLinkA = generateReferralLink(member_id, 'A');
		// const referralLinkB = generateReferralLink(member_id, 'B');

		// Assuming the updateReferralLinks function updates the database with these links
		// await updateReferralLinks(member_id, referralLinkA, referralLinkB);

		await sendVerificationEmail(email, verificationToken);

		res.status(201).send({
			message: 'User registered successfully. Please check your email to verify your account.',

			...{
				id: q.insertedId,
				username: firstName,
				firstName: firstName,
				lastName: lastName,
				parentMemberId,
				role: 'user',
			},
		});
	} catch (error) {
		logger.error('Registration error:', error);
		res.status(500).send({ message: 'Error registering user', error: error.toString() });
	}
});

module.exports = router;
