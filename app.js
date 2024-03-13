const express = require('express');
var cors = require('cors');

const userRegistrationRouter = require('./routes/user-registration');
const emailVerifyRouter = require('./routes/email-verify');
const authRouter = require('./routes/auth');
const referralRouter = require('./routes/referralRouter'); // Ensure the correct path
const paymentRoutes = require('./routes/payment'); // Include the payment routes
const { expressWinstonLogger, expressWinstonErrorLogger, logger } = require('./utilities/logger');
const referralTreeRouter = require('./routes/referralTree'); // Make sure this path is correct.
// const referralCalcRouter = require('./routes/referralCalc'); // Adjust the path as necessary



const app = express();

// app.use(expressWinstonLogger);

app.use(cors());

app.use(function (req, res, next) {
	// res.header('Access-Control-Allow-Origin', 'https://api.forexcellencenet.com/');
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
	next();
});

app.use(express.json());

app.get('/', (req, res) => {
	res.send('Welcome to the server!');
});

app.use('/api/users', userRegistrationRouter);
app.use('/api/verify', emailVerifyRouter);
app.use('/api/auth', authRouter);
app.use('/api/referral', referralRouter); // Corrected the path
app.use('/api/payment', paymentRoutes); // Mount the payment routes on '/api/payment'
app.use('/api/referral-tree', referralTreeRouter);
// app.use('/api', referralCalcRouter);
// app.use(expressWinstonErrorLogger);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
