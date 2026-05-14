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
	APP_CODE,
	JWT_REFRESH_SECRET,
	SHOULD_SYNC_HRMS,
} = require('../config/serverConfig');
const {
	generateAccessToken,
	generateRefreshToken,
} = require('../utils/generateToken');
const AppError = require('../utils/AppError');
const { generateSignedUrl } = require('../utils/s3Bucket');
const fetchPermissions = require('../helpers/fetchPermissions');
const logger = require('../utils/logger');

exports.register = async ({ name, email, password, roleId }) => {
	const hashed = await bcrypt.hash(password, 10);
	return User.create({ name, email, password: hashed, roleId });
};

// exports.login = async ({ email, password }, res) => {
// 	const user = await User.findOne({
// 		where: { email, is_active: 1 },
// 		include: [
// 			{ model: Role, as: 'userRoles', through: { attributes: [] } },
// 			{ model: organization, as: 'organization' },
// 			{
// 				model: BusinessPartner,
// 				as: 'partner',
// 				required: false,
// 				include: [
// 					{
// 						model: Address,
// 						as: 'addresses',
// 						required: false,
// 					},
// 				],
// 			},
// 		],
// 	});

// 	logger.debug('Login User: ', { user: user.get({ plain: true }) });

// 	if (!user) throw new AppError('User not found!', 401);

// 	if (user.image) {
// 		user.image = await generateSignedUrl(user.image);
// 	}

// 	const isMatch = await bcrypt.compare(password, user.password);
// 	if (!isMatch) throw new AppError('Invalid credentials', 401);

// 	if (!user.userRoles?.length) {
// 		throw new AppError('No roles assigned to this user', 403);
// 	}

// 	const roleCodes = user.userRoles.map((r) => r.code); // ['super_admin', 'org_admin']
// 	const roleNames = user.userRoles.map((r) => r.name); // ['Super Admin', 'Org Admin']

// 	let state_id = null;
// 	if (roleCodes.includes('org_admin')) {
// 		state_id = user.organization.state_id;
// 	} else if (['Vendor', 'Vendor-Customer'].includes(user.Role.name)) {
// 		state_id = user?.partner?.addresses[0].state_id;
// 	}

// 	const payload = {
// 		id: user.id,
// 		name: user.name,
// 		email: user.email,
// 		role: user.Role.name,
// 		roleId: user.roleId,
// 		avatar: user.image,
// 		org_id: user.org_id,
// 		swayamm_org_id: user?.organization?.swayamm_org_id ?? null,
// 		state_id,
// 		organization_name: user?.organization?.org_name ?? null,
// 		isSuperAdmin: user.Role.name === 'Super Admin',
// 	};
// 	const accessToken = generateAccessToken(payload);
// 	const refreshToken = generateRefreshToken(payload);

// 	// Send refresh token via HTTP-only cookie
// 	res.cookie('refreshToken', refreshToken, {
// 		httpOnly: true,
// 		domain: COOKIE_DOMAIN,
// 		secure: COOKIE_SECURE, // set true in production
// 		sameSite: 'strict',
// 		maxAge: 7 * 24 * 60 * 60 * 1000,
// 		// maxAge: 2 * 60 * 1000,
// 	});

// 	res.cookie('accessToken', accessToken, {
// 		httpOnly: true,
// 		domain: COOKIE_DOMAIN,
// 		secure: COOKIE_SECURE, // set true in production
// 		sameSite: 'strict',
// 		maxAge: 15 * 60 * 1000,
// 		// maxAge: 7 * 24 * 60 * 60 * 1000,
// 	});

// 	return {
// 		id: user.id,
// 		role: user.Role.name,
// 		name: user.name,
// 		email: user.email,
// 		companyId: user.companyId,
// 		roleId: user.roleId,
// 		imageUrl: user.image,
// 		org_id: user.org_id,
// 		swayamm_org_id: user?.organization?.swayamm_org_id ?? null,
// 		state_id,
// 		organization_name: user?.organization?.org_name ?? null,
// 		isSuperAdmin: user.Role.name === 'Super Admin',
// 	};
// };

exports.login = async ({ email, password }, res) => {
	const user = await User.findOne({
		where: { email },
		include: [
			{
				model: Role,
				as: 'userRoles',
				through: { attributes: [] },
			},
			{
				model: organization,
				as: 'organization',
				required: false,
			},
		],
	});

	if (!user) throw new AppError('Invalid credentials', 401);

	if (user && !user.is_active) {
		throw new AppError(
			'User account is inactive. Please contact your organization to activate it.',
			403,
		);
	}

	const isMatch = await bcrypt.compare(password, user.password);
	if (!isMatch) throw new AppError('Invalid credentials', 401);

	if (!user.userRoles?.length) {
		throw new AppError('No roles assigned to this user', 403);
	}

	// Image
	let imageUrl = null;
	if (user.image) imageUrl = await generateSignedUrl(user.image);

	// Roles
	const roleCodes = user.userRoles.map((r) => r.code);
	const roleNames = user.userRoles.map((r) => r.name);
	const isSuperAdmin = roleCodes.includes('super_admin');

	const APP_CODE = process.env.APP_CODE; // 'SCM'

	// JWT payload
	const payload = {
		sub: user.uuid,
		id: user.id,
		name: user.name,
		email: user.email,
		org_id: user.org_id,
		org_uuid: user.organization?.uuid,
		swayamm_org_id: user.organization?.swayamm_org_id ?? null,
		roles: roleCodes,
		role: roleCodes[0],
		apps: {
			[APP_CODE]: roleCodes, // { SCM: ['indent_verifier'] }
		},
		isSuperAdmin,
		avatar: imageUrl,
		organization_name: user.organization?.org_name ?? null,
	};

	const accessToken = generateAccessToken(payload);
	const refreshToken = generateRefreshToken(payload);

	res.cookie('refreshToken', refreshToken, {
		httpOnly: true,
		domain: COOKIE_DOMAIN,
		secure: COOKIE_SECURE,
		sameSite: 'strict',
		maxAge: 7 * 24 * 60 * 60 * 1000,
	});

	res.cookie('accessToken', accessToken, {
		httpOnly: true,
		domain: COOKIE_DOMAIN,
		secure: COOKIE_SECURE,
		sameSite: 'strict',
		maxAge: 15 * 60 * 1000,
	});

	return {
		id: user.id,
		user_uuid: user.uuid,
		org_uuid: user.organization?.uuid,
		name: user.name,
		email: user.email,
		org_id: user.org_id,
		swayamm_org_id: user.organization?.swayamm_org_id ?? null,
		roles: roleNames,
		role: roleNames[0],
		imageUrl,
		isSuperAdmin,
		organization_name: user.organization?.org_name ?? null,
	};
};

exports.getLoggedInUser = async (uuid, res) => {
	const user = await User.findOne({
		where: { uuid, is_active: 1 },
		include: [
			{
				model: Role,
				as: 'userRoles',
				through: { attributes: [] },
			},
			{ model: organization, as: 'organization' },
		],
	});
	if (!user) throw new AppError('User not found!', 404);

	if (!user.userRoles?.length) {
		throw new AppError('No roles assigned to this user', 403);
	}

	if (user.image) {
		user.image = await generateSignedUrl(user.image);
	}

	// Roles
	const roleCodes = user.userRoles.map((r) => r.code);
	const roleNames = user.userRoles.map((r) => r.name);
	const isSuperAdmin = roleCodes.includes('super_admin');

	const req = { user: { id: user.id } };
	const permissions = await fetchPermissions(req);

	return {
		id: user.id,
		user_uuid: user.uuid,
		org_uuid: user.organization?.uuid,
		name: user.name,
		email: user.email,
		org_id: user.org_id,
		swayamm_org_id: user.organization?.swayamm_org_id ?? null,
		roles: roleNames,
		role: roleNames[0],
		isSuperAdmin,
		imageUrl: user.image,
		state_id: user.organization?.state_id ?? null,
		permissions,
		organization_name: user?.organization?.org_name ?? null,
		shouldSyncHrms: SHOULD_SYNC_HRMS
	};
};

exports.refreshToken = async (req, res) => {
	const token = req.cookies.refreshToken;
	if (!token) throw new AppError('No refresh token', 401);

	let decoded;
	try {
		decoded = jwt.verify(token, JWT_REFRESH_SECRET);
	} catch (err) {
		throw new AppError('Invalid or expired refresh token', 401);
	}
	logger.debug('User For Refresh Token', { decoded });

	const user = await User.findOne({
		where: { uuid: decoded.sub, is_active: 1 },
		include: [
			{
				model: Role,
				as: 'userRoles',
				through: { attributes: [] },
			},
			{
				model: organization,
				as: 'organization',
				required: false,
			},
		],
	});

	if (!user) {
		// res.clearCookie('accessToken');
		// res.clearCookie('refreshToken');
		throw new AppError('User not found', 401);
	}

	if (!user.userRoles || user.userRoles.length === 0) {
		throw new AppError('No roles assigned', 403);
	}

	let imageUrl = null;
	if (user.image) {
		imageUrl = await generateSignedUrl(user.image);
	}

	const roleCodes = user.userRoles.map((r) => r.code);
	const isSuperAdmin = roleCodes.includes('super_admin');

	const payload = {
		sub: user.uuid,
		id: user.id,
		name: user.name,
		email: user.email,
		org_uuid: user.organization?.uuid,
		org_id: user.org_id,
		swayamm_org_id: user.organization?.swayamm_org_id ?? null,
		roles: roleCodes,
		role: roleCodes[0],
		apps: {
			[APP_CODE]: roleCodes,
		},
		isSuperAdmin,
		avatar: imageUrl,
		organization_name: user.organization?.org_name ?? null,
	};

	return generateAccessToken(payload);
};
