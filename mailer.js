const nodemailer = require('nodemailer');
const { logger } = require('./utilities/logger');

// SMTP configuration

const transporter = nodemailer.createTransport({
	host: process.env.SMTP_HOST,
	port: parseInt(process.env.SMTP_PORT, 10),
	secure: process.env.SMTP_SECURE === 'true',
	auth: {
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS,
	},
});
// const transporter = nodemailer.createTransport({
// 	host: 'forexcellencenet.com', // SMTP server address
// 	port: 587,
// 	secure: false, // True for 465, false for other ports. Use true if you're connecting over SSL
// 	auth: {
// 		user: 'no-reply@forexcellencenet.com', // SMTP username
// 		pass: 't06tJs10!', // SMTP password
// 	},
// 	tls: {
// 		rejectUnauthorized: false,
// 	},
// });

// /**
//  * Send a verification email to the user.
//  * @param {string} email - The email address of the recipient.
//  * @param {string} verificationToken - The unique verification token for the user.
//  */
// async function sendVerificationEmail(email, verificationToken) {
// 	const verificationLink = `https://api.forexcellencenet.com/verify?token=${verificationToken}`;

// 	const mailOptions = {
// 		from: process.env.SMTP_USER, // Sender address
// 		to: email, // Recipient address
// 		subject: 'Verify Your Email Address', // Subject line
// 		html: `<p>Please verify your email address by clicking on the following link: <a href="${verificationLink}">${verificationLink}</a></p>`, // Email body
// 	};

// 	// Send the email
// 	try {
// 		await transporter.sendMail(mailOptions);
// 		logger.log('Verification email sent.');
// 	} catch (error) {
// 		logger.error('Failed to send verification email:', error);
// 	}
// }

module.exports = { transporter };
