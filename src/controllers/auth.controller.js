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

exports.logout = catchAsync(async (req, res) => {
	const token = req.cookies.refreshToken;
	if (token) {
		try {
			// ignoreExpiration: an expired refresh token still identifies a real
			// session that should be revoked, not just one we can't act on
			const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
				ignoreExpiration: true,
			});
			// Only this service's own current_jti is ours to clear — a token
			// minted by AUTH/VCP was never recorded in this service's column
			if (decoded.iss === 'SCM') {
				await User.update(
					{ current_jti: null },
					{ where: { uuid: decoded.sub, current_jti: decoded.jti } },
				);
			}
		} catch (err) {
			// malformed/forged token — nothing to revoke, fall through to cookie clearing
		}
	}

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
	const uuid = req.user.sub;
	console.log('uuid ', uuid);

	const userData = await AuthService.getLoggedInUser(uuid, res);
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
