const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const {
	User,
	Role,
	BusinessPartner,
	Address,
	organization,
	sequelize,
} = require('../models/index');
const {
	JWT_ACCESS_SECRET,
	COOKIE_DOMAIN,
	COOKIE_SECURE,
} = require('../config/serverConfig');
const {
	generateAccessToken,
	generateRefreshToken,
} = require('../utils/generateToken');
const AppError = require('../utils/AppError');
const { generateSignedUrl } = require('../utils/s3Bucket');
const fetchPermissions = require('../helpers/fetchPermissions');

exports.register = async ({ name, email, password, roleId }) => {
	const hashed = await bcrypt.hash(password, 10);
	return User.create({ name, email, password: hashed, roleId });
};

exports.login = async ({ email, password }, res) => {
	const user = await User.findOne({
		where: { email, is_active: 1 },
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
		user.image = await generateSignedUrl(user.image);
	}

	const isMatch = await bcrypt.compare(password, user.password);
	if (!isMatch) throw new AppError('Invalid credentials', 401);

	let state_id = null;
	if (user.Role.name === 'Admin') {
		state_id = user.organization.state_id;
	} else if (['Vendor', 'Vendor-Customer'].includes(user.Role.name)) {
		state_id = user?.partner?.addresses[0].state_id;
	}

	const permissions = await sequelize.query(
		`
  SELECT DISTINCT CONCAT(m.slug, ':', p.action) AS permission
  FROM user_roles ur
  JOIN role_permissions rp ON rp.role_id = ur.role_id
  JOIN Permissions p ON p.id = rp.permission_id
  JOIN Menus m ON m.id = p.menu_id
  WHERE ur.user_id = ?
`,
		{
			replacements: [user.id],
			type: sequelize.QueryTypes.SELECT,
		},
	);

	const permissionList = permissions.map((p) => p.permission);

	const payload = {
		id: user.id,
		email: user.email,
		role: user.Role.name,
		companyId: user.companyIds,
		roleId: user.roleId,
		avatar: user.image,
		org_id: user.org_id,
		state_id,
		permissions: permissionList,
		isSuperAdmin: user.Role.name === 'Super Admin'
	};
	const accessToken = generateAccessToken(payload);
	const refreshToken = generateRefreshToken(payload);

	// Send refresh token via HTTP-only cookie
	res.cookie('refreshToken', refreshToken, {
		httpOnly: true,
		domain: COOKIE_DOMAIN,
		secure: COOKIE_SECURE, // set true in production
		sameSite: 'strict',
		maxAge: 7 * 24 * 60 * 60 * 1000,
		// maxAge: 2 * 60 * 1000,
	});

	res.cookie('accessToken', accessToken, {
		httpOnly: true,
		domain: COOKIE_DOMAIN,
		secure: COOKIE_SECURE, // set true in production
		sameSite: 'strict',
		maxAge: 15 * 60 * 1000,
		// maxAge: 7 * 24 * 60 * 60 * 1000,
	});

	return {
		id: user.id,
		role: user.Role.name,
		name: user.name,
		email: user.email,
		companyId: user.companyId,
		roleId: user.roleId,
		imageUrl: user.image,
		org_id: user.org_id,
		state_id,
		isSuperAdmin: user.Role.name === 'Super Admin'
	};
};

exports.getLoggedInUser = async (user_id, res) => {
	const user = await User.findOne({
		where: { id: user_id, is_active: 1 },
		include: [
			{ model: Role },
			// {
			// 	model: BusinessPartner,
			// 	as: 'partner',
			// 	include: { model: Address, as: 'addresses' },
			// },
			// { model: organization, as: 'organization' },
		],
	});
	if (!user) throw new AppError('User not found!', 401);

	if (user.image) {
		user.image = await generateSignedUrl(user.image);
	}

	let state_id = null;
	if (user.Role.name === 'Admin') {
		state_id = user?.organization?.state_id ?? null;
	} else if (['Vendor', 'Vendor-Customer'].includes(user.Role.name)) {
		state_id = user?.partner?.addresses[0].state_id ?? null;
	}

	const req = { user: { id: user.id } };
	const permissions = await fetchPermissions(req);
	
	return {
		id: user.id,
		role: user.Role.name,
		name: user.name,
		email: user.email,
		companyId: user.companyId,
		roleId: user.roleId,
		imageUrl: user.image,
		org_id: user.org_id,
		state_id,
		permissions,
		isSuperAdmin: user.Role.name === 'Super Admin'
	};
};
