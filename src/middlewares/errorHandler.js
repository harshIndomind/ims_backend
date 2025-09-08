const logger = require('../utils/logger');
const { APP_DEBUG } = require('../config/serverConfig');

module.exports = (err, req, res, next) => {
	// Unwrap if error is wrapped
	if (err.error instanceof Error) {
		err = err.error;
	}

	const statusCode = err.statusCode || 500;
	const message = err.isOperational ? err.message : 'Internal Server Error';

	// Log using Winston
	logger.error({
		message: err.message,
		statusCode,
		stack: err.stack,
		timestamp: new Date().toISOString(),
		request: {
			method: req.method,
			url: req.originalUrl,
			body: req.body,
			params: req.params,
			query: req.query
		}
	});
	console.log("APP_DEBUG ", APP_DEBUG);
	
	res.status(statusCode).json({
		success: false,
		message,
		stack: APP_DEBUG == 'true' ? err.stack : undefined,
	});
};
