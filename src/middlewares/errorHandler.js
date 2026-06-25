const logger = require('../utils/logger');
const { APP_DEBUG } = require('../config/serverConfig');

module.exports = (err, req, res, next) => {
	// Unwrap if error is wrapped
	if (err.error instanceof Error) {
		err = err.error;
	}

	// Map DB-level unique constraint violations (e.g. duplicate employee_code
	// inserted concurrently, or via the auth-service sync event path) to a
	// clean 409 instead of leaking a raw SQL error as a 500.
	if (err.name === 'SequelizeUniqueConstraintError') {
		const field = err.errors?.[0]?.path || Object.keys(err.fields || {})[0];
		const label = field
			? field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
			: 'Value';
		err.statusCode = 409;
		err.isOperational = true;
		err.message = `${label} already exists`;
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
