var winston = require('winston');
var expressWinston = require('express-winston');

var transports = [new winston.transports.File({ filename: 'app.log.txt' }), new winston.transports.Console()];

var logger = winston.createLogger({
	transports,
});

var expressWinstonLogger = expressWinston.logger({
	transports,
	format: winston.format.combine(winston.format.colorize(), winston.format.json()),
	meta: true, // optional: control whether you want to log the meta data about the request (default to true)
	msg: 'HTTP {{req.method}} {{req.url}}', // optional: customize the default logging message. E.g. "{{res.statusCode}} {{req.method}} {{res.responseTime}}ms {{req.url}}"
	expressFormat: true, // Use the default Express/morgan request formatting. Enabling this will override any msg if true. Will only output colors with colorize set to true
});

var expressWinstonErrorLogger = expressWinston.errorLogger({
	transports,
	format: winston.format.combine(winston.format.colorize(), winston.format.json()),
});

module.exports = { logger, expressWinstonLogger, expressWinstonErrorLogger };
