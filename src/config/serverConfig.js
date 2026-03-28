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
	WEBHOOK_SECRET_KEY: process.env.WEBHOOK_SECRET_KEY,
	PORTING_FILE: process.env.PORTING_FILE,
	SWAYAMM_API_BASE_URL: process.env.SWAYAMM_API_BASE_URL,
	SWAYAMM_LOGIN_ENDPOINT: process.env.SWAYAMM_LOGIN_ENDPOINT,
	SWAYAMM_USERNAME: process.env.SWAYAMM_USERNAME,
	SWAYAMM_PASSWORD: process.env.SWAYAMM_PASSWORD,
	SWAYAMM_GET_ACCOUNT_NAME_ENDPOINT:
		process.env.SWAYAMM_GET_ACCOUNT_NAME_ENDPOINT,
	SWAYAMM_CREATE_UPDATE_ACCOUNT_ENDPOINT:
		process.env.SWAYAMM_CREATE_UPDATE_ACCOUNT_ENDPOINT,
	SWAYAMM_GET_ACCOUNT_BY_CODE_NAME_ENDPOINT:
		process.env.SWAYAMM_GET_ACCOUNT_BY_CODE_NAME_ENDPOINT,
	S2S_COMM_KEY: process.env.S2S_COMM_KEY,
	COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
	COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
	VCP_SERVICE_API_BASE_URL: process.env.VCP_SERVICE_API_BASE_URL,
	VCP_SERVICE_PRODUCT_ENDPOINT: process.env.VCP_SERVICE_PRODUCT_ENDPOINT,
	rabbitmq: {
		url: process.env.RABBITMQ_URL || 'amqp://localhost',
		authQueue: process.env.RABBITMQ_AUTH_SERVICE_QUEUE || 'auth_service_queue'
	},
	defaultPassword: process.env.DEFAULT_USER_PASSWORD || 123456
};
