const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const logDir = path.join(__dirname, '../../logs');

if (!fs.existsSync(logDir)) {
	fs.mkdirSync(logDir);
}

const logger = createLogger({
	level: process.env.LOG_LEVEL || 'info',
	defaultMeta: {
		serviceName: 'SCM Service'
	},
	format: format.combine(
		format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
		format.errors({ stack: true }),
		format.json()
	),
	transports: [
		new DailyRotateFile({
			filename: path.join(logDir, 'error-%DATE%.log'),
			datePattern: 'YYYY-MM-DD',
			level: 'error',
			maxSize: '10m',
			maxFiles: '14d',
		}),
		new DailyRotateFile({
			filename: path.join(logDir, 'combined-%DATE%.log'),
			datePattern: 'YYYY-MM-DD',
			maxSize: '20m',
			maxFiles: '14d',
		}),
	],
});

if (process.env.APP_ENV !== 'production') {
	logger.add(
		new transports.Console({
			format: format.combine(
				format.colorize({all:true}),
				format.timestamp({ format: 'DD-MM-YYYY HH:mm:ss' }),
				format.printf(({ level, message, timestamp, ...meta }) => {
					return `${timestamp} [${level}]: ${message} ${
						Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
					}`;
				})
			),
		})
	);
}

module.exports = logger;
