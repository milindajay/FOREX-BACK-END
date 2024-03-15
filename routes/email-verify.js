const express = require('express');
const db = require('../database');
const { logger } = require('../utilities/logger');
const router = express.Router();

router.get('/verify', async (req, res) => {
	const token = req.query.token;
	if (!token) {
		return res.status(400).send('Verification token is missing.');
	}

	try {
		const result = await db.query(
			'UPDATE `fx_users` SET profile_status = ?, verification_date = NOW() WHERE verification_token = ? AND profile_status != "Verified"',
			['Verified', token]
		);
		if (result.affectedRows === 0) {
			return res.status(404).json({ success: false, message: 'User not found or already verified.' });
		}

		res.json({ success: true, message: 'Your email has been successfully verified.' });
	} catch (error) {
		logger.error('Email verification error:', error);
		res.status(500).json({ success: false, message: 'Internal server error during email verification.' });
	}
});

module.exports = router;
