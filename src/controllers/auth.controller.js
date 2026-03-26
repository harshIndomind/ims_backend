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

exports.refreshToken = catchAsync(async (req, res) => {
	const token = req.cookies.refreshToken;
	console.log('token ', token);

	if (!token) return res.status(401).json({ message: 'No token' });

	try {
		const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
		console.log("refreshToken decoded ", decoded)
		const user = await User.findOne({
			where: { id: decoded.id, is_active: 1 },
			include: [
				{ model: Role },
				// {
				// 	model: BusinessPartner,
				// 	as: 'partner',
				// 	include: { model: Address, as: 'addresses' },
				// },
				{ model: organization, as: 'organization' },
			],
		});
		if (!user) throw new AppError('User not found!', 401);

		if (user.image) {
			decoded.avatar = await generateSignedUrl(user.image);
		}

		let state_id = null;
		if (user.Role.name === 'Admin') {
			state_id = user.organization.state_id;
		} else if (['Vendor', 'Vendor-Customer'].includes(user.Role.name)) {
			state_id = user?.partner?.addresses[0].state_id;
		}

		// const permissions = await sequelize.query(
		// 	`
		//   SELECT DISTINCT CONCAT(m.slug, ':', p.action) AS permission
		//   FROM user_roles ur
		//   JOIN role_permissions rp ON rp.role_id = ur.role_id
		//   JOIN Permissions p ON p.id = rp.permission_id
		//   JOIN Menus m ON m.id = p.menu_id
		//   WHERE ur.user_id = ?
		// `,
		// 	{
		// 		replacements: [user.id],
		// 		type: sequelize.QueryTypes.SELECT,
		// 	},
		// );

		// const permissionList = permissions.map((p) => p.permission);

		const payload = {
			id: decoded.id,
			email: user.email,
			role: decoded.role,
			companyId: decoded.companyId ?? null,
			roleId: decoded.roleId,
			avatar: decoded.avatar,
			org_id: decoded.org_id,
			state_id,
			organization_name: decoded?.organization_name ?? null,
			isSuperAdmin: user.Role.name === 'Super Admin'
		};

		const accessToken = generateAccessToken({...payload});

		res.cookie('accessToken', accessToken, {
			httpOnly: true,
			domain: COOKIE_DOMAIN,
			secure: COOKIE_SECURE, // set true in production
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
