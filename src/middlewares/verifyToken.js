const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const {
	JWT_ACCESS_SECRET,
	SWAYAMM_JWT_ACCESS_SECRET,
	ENABLE_SWAYAMM_INTEGRATION,
} = require('../config/serverConfig');
const logger = require('../utils/logger');
const {
	User,
	Role,
	BusinessPartner,
	Address,
	organization,
} = require('../models/index');

const verifyToken = async (req, res, next) => {
	// Regular Token Verification
	const authHeader = req.cookies.accessToken;
	console.log('authHeader ', authHeader);

	// Check if token is present
	// if (!authHeader || !authHeader.startsWith('Bearer ')) {
	if (!authHeader) {
		return next(new AppError('Authorization token missing', 401));
	}

	// const token = authHeader.split(' ')[1];
	const token = authHeader;

	try {
		const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
		console.log('old decoded ', decoded);
		const user = await User.findOne({
			where: { email: decoded.email, is_active: 1 },
			include: [
				{ model: Role },
				{
					model: BusinessPartner,
					as: 'partner',
					include: { model: Address, as: 'addresses' },
				},
				{ model: organization, as: 'organization' },
			],
		});
		if (!user) throw new AppError('User not found!', 401);

		if (user.image) {
			user.image = await generateSignedUrl(user.image);
		}

		let state_id = null;
		if (user.Role.name === 'Admin') {
			state_id = user.organization.state_id;
		} else if (['Vendor', 'Vendor-Customer'].includes(user.Role.name)) {
			state_id = user?.partner?.addresses[0].state_id;
		}

		const payload = {
			id: user.id,
			role: user.Role.name,
			name: user.name,
			email: user.email,
			roleId: user.roleId,
			imageUrl: user.image,
			org_id: user.org_id,
			state_id,
		};
		console.log('new decoded ', payload);

		req.user = payload; // Attach user info to request
		next();
	} catch (err) {
		return next(new AppError('Invalid or expired token', 401));
	}
};

module.exports = verifyToken;
