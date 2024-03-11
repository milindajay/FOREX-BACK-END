const nodemailer = require('nodemailer');
require('dotenv').config();
const crypto = require('crypto');
const mysql = require('mysql');
const { logger } = require('./logger');

// Manually create a Promise-based query function
const db = mysql.createConnection({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
	database: process.env.DB_NAME,
});

db.connect((err) => {
	if (err) {
		logger.error('Error connecting to the database:', err);
		return;
	}
	logger.info('Connected to the database.');
});

function query(sql, params) {
	return new Promise((resolve, reject) => {
		db.query(sql, params, (error, results) => {
			if (error) reject(error);
			else resolve(results);
		});
	});
}

const transporter = nodemailer.createTransport({
	host: process.env.SMTP_HOST,
	port: parseInt(process.env.SMTP_PORT, 10),
	secure: process.env.SMTP_SECURE === 'true',
	auth: {
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS,
	},
});

async function generateMemberId() {
	try {
		const results = await query('SELECT MAX(member_id) AS maxId FROM `fx_users`');
		const maxId = results.length > 0 ? results[0].maxId : null;
		return maxId ? maxId + 1 : 7500;
	} catch (error) {
		logger.error('Error in generateMemberId:', error);
		throw error;
	}
}

async function generateVerificationToken(email) {
	const token = crypto.randomBytes(20).toString('hex');
	try {
		await query('UPDATE `fx_users` SET verification_token = ? WHERE email = ?', [token, email]);
		return token;
	} catch (error) {
		logger.error('Error in generateVerificationToken:', error);
		throw error;
	}
}

async function sendVerificationEmail(email, verificationToken) {
	const verificationLink = `https://api.forexcellencenet.com/api/verify/verify?token=${verificationToken}`;
	const mailOptions = {
		from: process.env.SMTP_USER,
		to: email,
		subject: 'Verify Your Email Address',
		html: `<p>Please verify your email address by clicking on the following link: <a href="${verificationLink}">${verificationLink}</a></p>`,
	};

	try {
		await transporter.sendMail(mailOptions);
		logger.info('Verification email sent.');
	} catch (error) {
		logger.error('Failed to send verification email:', error);
		throw new Error('Failed to send verification email');
	}
}

// function generateReferralLink(memberId, type) {
// 	const baseUrl = process.env.REFERRAL_BASE_URL || 'https://api.forexcellencenet.com/referral';
// 	return `${baseUrl}?ref=${memberId}&type=${type}`;
// }

// async function updateReferralLinks(memberId, referralLinkA, referralLinkB) {
// 	try {
// 		await query('UPDATE `fx_users` SET referral_link_a = ?, referral_link_b = ? WHERE member_id = ?', [
// 			referralLinkA,
// 			referralLinkB,
// 			memberId,
// 		]);
// 	} catch (error) {
// 		logger.error('Error in updateReferralLinks:', error);
// 		throw error;
// 	}
// }

module.exports = {
	generateMemberId,
	sendVerificationEmail,
	generateVerificationToken,
};
