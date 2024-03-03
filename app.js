const express = require('express');
var cors = require('cors');
const path = require('path');
const userRegistrationRouter = require('./routes/user-registration');
const emailVerifyRouter = require('./routes/email-verify');
const authRouter = require('./routes/auth');
const referralRouter = require('./routes/referralRouter'); // Ensure the correct path
const paymentRoutes = require('./routes/payment'); // Include the payment routes

const app = express();

app.get('/', (req, res) => {
    res.send('Welcome to the server!');
});
// app.use(
// 	cors({
// 		origin: 'http://localhost:3001',
// 	})
// );

app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "https://app.forexcellencenet.com"); 
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
  });
app.use(express.json());
app.use('/static', express.static(path.resolve('./frontend/static/')));

app.get('/', (req, res) => {
	res.sendFile(path.resolve('./frontend/index.html'));
});

app.use('/api/users', userRegistrationRouter);
app.use('/api/verify', emailVerifyRouter);
app.use('/api/auth', authRouter);
app.use('/api/referral', referralRouter); // Corrected the path
app.use('/api/payment', paymentRoutes); // Mount the payment routes on '/api/payment'

// If no API routes are hit, send the React app
// app.use(function (req, res) {
// 	res.sendFile(path.resolve('./frontend/index.html'));
// });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
