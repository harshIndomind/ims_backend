const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, Role } = require('../models/index');
const { JWT_ACCESS_SECRET } = require('../config/serverConfig');
const {
	generateAccessToken,
	generateRefreshToken,
} = require('../utils/generateToken');
const AppError = require('../utils/AppError');

exports.register = async ({ name, email, password, roleId }) => {
	const hashed = await bcrypt.hash(password, 10);
	return User.create({ name, email, password: hashed, roleId });
};

exports.login = async ({ email, password }, res) => {
	const user = await User.findOne({ where: { email, is_active: 1 }, include: Role });
	if (!user) throw new AppError('User not found!', 401);

	const isMatch = await bcrypt.compare(password, user.password);
	if (!isMatch) throw new AppError('Invalid credentials', 401);

	const payload = { id: user.id, role: user.Role.name, companyId: user.companyIds, roleId: user.roleId, avatar: user.image, org_id: user.org_id };
	const accessToken = generateAccessToken(payload);
	const refreshToken = generateRefreshToken(payload);

	// Send refresh token via HTTP-only cookie
	res.cookie('refreshToken', refreshToken, {
		httpOnly: true,
		secure: false, // set true in production
		sameSite: 'strict',
		maxAge: 7 * 24 * 60 * 60 * 1000,
		// maxAge: 2 * 60 * 1000,
	});

	res.cookie('accessToken', accessToken, {
		httpOnly: true,
		secure: false, // set true in production
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
		org_id: user.org_id
	};
};
