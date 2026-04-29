const AuthService = require('../services/auth.service');
const {
	JWT_REFRESH_SECRET,
	COOKIE_DOMAIN,
	COOKIE_SECURE,
} = require('../config/serverConfig');
const catchAsync = require('../utils/catchAsync');
const jwt = require('jsonwebtoken');
const { generateAccessToken } = require('../utils/generateToken');
const {
	User,
	Role,
	BusinessPartner,
	Address,
	organization,
	sequelize,
} = require('../models/index');
const { generateSignedUrl } = require('../utils/s3Bucket');

exports.register = catchAsync(async (req, res) => {
	const user = await AuthService.register(req.body);
	res.status(201).json(user);
});

exports.login = catchAsync(async (req, res) => {
	const loginData = await AuthService.login(req.body, res);
	res.json({ message: 'Login Successfully', data: loginData });
});

exports.logout = catchAsync((req, res) => {
	res.clearCookie('accessToken', {
		httpOnly: true,
		secure: COOKIE_SECURE,
		domain: COOKIE_DOMAIN,
	});
	res.clearCookie('refreshToken', {
		httpOnly: true,
		secure: COOKIE_SECURE,
		domain: COOKIE_DOMAIN,
	});
	res.json({ message: 'Logged out successfully' });
});

exports.getLoggedInUser = catchAsync(async (req, res) => {
	const userId = req.user.id;
	console.log('userId ', userId);

	const userData = await AuthService.getLoggedInUser(userId, res);
	res.json({ message: 'User details fetched Successfully', data: userData });
});

exports.refreshToken = catchAsync(async (req, res) => {
	const accessToken = await AuthService.refreshToken(req, res);

	res.cookie('accessToken', accessToken, {
		httpOnly: true,
		secure: COOKIE_SECURE,
		sameSite: 'lax',
		domain: COOKIE_DOMAIN,
		maxAge: 15 * 60 * 1000,
	});
	res.json({ message: 'Access token refreshed' });
});
