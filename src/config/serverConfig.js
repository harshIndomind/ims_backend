const dotenv = require('dotenv');

dotenv.config();

module.exports = {
	APP_ENV: process.env.APP_ENV || 'development',
	APP_DEBUG: process.env.APP_DEBUG,
	PORT: process.env.PORT || 3000,
	BASE_URL:
		process.env.APP_ENV === 'development'
			? `${process.env.BASE_URL}:${process.env.PORT}`
			: process.env.BASE_URL,
	JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
	JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
	JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES,
	JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES,
	DB_USERNAME: process.env.DB_USERNAME,
	DB_PASSWORD: process.env.DB_PASSWORD,
	DB_DATABASE: process.env.DB_DATABASE,
	DB_HOST: process.env.DB_HOST,
	CLIENT_BASE_URL: process.env.CLIENT_BASE_URL,
	WEBHOOK_SECRET_KEY: process.env.WEBHOOK_SECRET_KEY
};
