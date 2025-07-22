const jwt = require('jsonwebtoken');
const {JWT_ACCESS_SECRET,JWT_ACCESS_EXPIRES, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES} = require('../config/serverConfig');

exports.generateAccessToken = (payload) => {
	return jwt.sign(payload, JWT_ACCESS_SECRET, {
		expiresIn: JWT_ACCESS_EXPIRES,
	});
};

exports.generateRefreshToken = (payload) => {
	return jwt.sign(payload, JWT_REFRESH_SECRET, {
		expiresIn: JWT_REFRESH_EXPIRES,
	});
};
