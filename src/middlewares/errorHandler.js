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
		timestamp: new Date().toISOString(),
		statusCode,
		message: err.message,
		stack: err.stack,
		request: {
			method: req.method,
			url: req.originalUrl,
			body: req.body,
			params: req.params,
			query: req.query
		}
	});
	
	res.status(statusCode).json({
		success: false,
		message,
		stack: APP_DEBUG == 'true' ? err.stack : undefined,
	});
};
