const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// Create logger
const logger = createLogger({
	level: 'info',
	format: format.combine(
		format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
		format.errors({ stack: true }),
		format.json()
	),
	transports: [
		new DailyRotateFile({
			filename: 'logs/error-%DATE%.log',
			datePattern: 'YYYY-MM-DD',
			level: 'error',
			maxSize: '10m',
			maxFiles: '14d' // keep logs for 14 days
		}),
		new DailyRotateFile({
			filename: 'logs/combined-%DATE%.log',
			datePattern: 'YYYY-MM-DD',
			maxSize: '20m',
			maxFiles: '14d'
		})
	]
});

// Add console logs only in dev
if (process.env.APP_ENV !== 'production') {
	logger.add(new transports.Console({
		format: format.combine(
			format.colorize(),
			format.simple()
		)
	}));
}

module.exports = logger;
