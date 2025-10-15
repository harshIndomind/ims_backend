const AuthService = require('../services/auth.service');
const { JWT_REFRESH_SECRET } = require('../config/serverConfig');
const catchAsync = require('../utils/catchAsync');
const jwt = require('jsonwebtoken');
const { generateAccessToken } = require('../utils/generateToken');

exports.register = catchAsync(async (req, res) => {
	const user = await AuthService.register(req.body);
	res.status(201).json(user);
});

exports.login = catchAsync(async (req, res) => {
	const loginData = await AuthService.login(req.body, res);
	res.json({ message: 'Login Successfully', data: loginData });
});

exports.refreshToken = catchAsync(async (req, res) => {
	const token = req.cookies.refreshToken;
	console.log('token ', token);

	if (!token) return res.status(401).json({ message: 'No token' });

	try {
		const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
		const payload = {
			id: decoded.id,
			role: decoded.role,
			companyId: decoded.companyId ?? null,
			roleId: decoded.roleId,
			avatar: decoded.avatar,
			org_id: decoded.org_id
		};

		const accessToken = generateAccessToken(payload);

		res.cookie('accessToken', accessToken, {
			httpOnly: true,
			secure: false, // set true in production
			sameSite: 'strict',
			maxAge: 15 * 60 * 1000,
			// maxAge: 7 * 24 * 60 * 60 * 1000,
		});

		res.json({ message: 'A new refresh token is generated...', accessToken });
	} catch (err) {
		return res.status(403).json({ message: 'Invalid token' });
	}
});

exports.logout = catchAsync((req, res) => {
	res.clearCookie('accessToken', { httpOnly: true, secure: true });
	res.clearCookie('refreshToken', { httpOnly: true, secure: true });
	res.json({ message: 'Logged out successfully' });
});
