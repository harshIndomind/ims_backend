const AppError = require('../utils/AppError');
const {
	S2S_COMM_KEY,
} = require('../config/serverConfig');

const verifyServiceToken = async (req, res, next) => {
	const s2sCommKey = req.headers['x-s2s-comm-key'];

	if (!s2sCommKey || s2sCommKey !== S2S_COMM_KEY) {
		return next(new AppError('Service 2 Service Communication Key missing or not matched', 401));
	}

	next();
};

module.exports = verifyServiceToken;
