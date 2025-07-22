const { createLogger, format, transports } = require('winston');

const logger = createLogger({
	level: 'info',
	format: format.combine(
		format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
		format.errors({ stack: true }),
		format.json()
	),
	transports: [
		new transports.File({ filename: 'logs/error.log', level: 'error' }),
		new transports.File({ filename: 'logs/combined.log' }),
	],
});

// For development, also log to the console
if (process.env.APP_ENV !== 'production') {
	logger.add(new transports.Console({
		format: format.combine(
			format.colorize(),
			format.simple()
		)
	}));
}

module.exports = logger;
