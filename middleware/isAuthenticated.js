const jwt = require('jsonwebtoken');

const isAuthenticated = (req, res, next) => {
	try {
		const { authorization } = req.headers;
		if (!authorization)
			return res.status(401).json({ success: false, message: 'Request should have the authorization header.' });

		const [, token] = authorization.split(' ');

		const decoded = jwt.verify(token, process.env.JWT_SECRET);

		if (decoded && decoded.id && decoded.role) {
			req.locals = { id: decoded.id, role: decoded.role };
			return next();
		}
		return res.status(401).json({ success: false, message: 'Access denied.' });
	} catch (error) {
		return res.status(401).json({ success: false, message: error.message });
	}
};

module.exports = { isAuthenticated };
