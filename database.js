require('dotenv').config();
const mysql = require('mysql');
const { logger } = require('./utilities/logger');

const db = mysql.createConnection({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
	database: process.env.DB_NAME,
});

db.connect((error) => {
	if (error) {
		logger.error('Error connecting to the database:', error);
		return;
	}
	logger.info('Connected to the MySQL server.');
});

function query(sql, params) {
	return new Promise((resolve, reject) => {
		db.query(sql, params, (error, results) => {
			if (error) reject(error);
			else resolve(results);
		});
	});
}

module.exports = { query };
