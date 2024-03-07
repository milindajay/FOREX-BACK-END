const express = require('express');
const bcrypt = require('bcrypt');
const { query } = require('../database'); // Ensure this points to your promisified query function
const {
	sendVerificationEmail,
	generateMemberId,
	generateVerificationToken,
	generateReferralLink,
	updateReferralLinks, // Assuming this function updates referral links in the user's record
} = require('../utilities/utils');
const { logger } = require('../utilities/logger');
const router = express.Router();

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

		const hashedPassword = await bcrypt.hash(password, 10);
		const member_id = await generateMemberId(); // Ensure this aligns with your ID generation logic
		const verificationToken = await generateVerificationToken(email);

		// Insert the new user into the database, now including referral_type
		const q = await query(
			'INSERT INTO `fx-users` (introducer, first_name, last_name, email, mobile_number, secondary_phone_number, address, national_identity_number, date_of_birth, nationality, password, member_id, verification_token, referral_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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

		// Generate referral links for the new user using their member_id
		const referralLinkA = generateReferralLink(member_id, 'A');
		const referralLinkB = generateReferralLink(member_id, 'B');

		// Assuming the updateReferralLinks function updates the database with these links
		await updateReferralLinks(member_id, referralLinkA, referralLinkB);

		await sendVerificationEmail(email, verificationToken);

		res.status(201).send({
			message: 'User registered successfully. Please check your email to verify your account.',
			referralLinkA,
			referralLinkB,
			...{
				id: q.insertedId,
				username: firstName,
				firstName: firstName,
				lastName: lastName,
				role: 'User',
			},
		});
	} catch (error) {
		logger.error('Registration error:', error);
		res.status(500).send({ message: 'Error registering user', error: error.toString() });
	}
});

module.exports = router;
