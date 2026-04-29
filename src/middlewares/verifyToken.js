const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const { JWT_ACCESS_SECRET } = require('../config/serverConfig');
const { User, organization } = require('../models/index');

const verifyToken = async (req, res, next) => {
	const authHeader = req.cookies.accessToken;

	if (!authHeader) {
		return next(new AppError('Authorization token missing', 401));
	}

	try {
		const decoded = jwt.verify(authHeader, JWT_ACCESS_SECRET);

		let org_id = decoded.org_id;
		let org_uuid = decoded.org_uuid;
		let swayamm_org_id = decoded.swayamm_org_id;
		let organization_name = decoded.organization_name;
		let state_id = decoded.state_id;

		if (org_uuid) {
			// New tokens: resolve local org_id from the shared org UUID
			const org = await organization.findOne({
				where: { uuid: org_uuid },
				attributes: ['id', 'swayamm_org_id', 'org_name', 'state_id'],
			});
			if (org) {
				org_id = org.id;
				swayamm_org_id = org.swayamm_org_id;
				organization_name = org.org_name;
				state_id = org.state_id;
			}
		} else if (decoded.sub) {
			// Old tokens without org_uuid: resolve via local user record using user UUID
			const user = await User.findOne({
				where: { uuid: decoded.sub },
				include: [{ model: organization, as: 'organization', required: false }],
				attributes: ['id', 'org_id'],
			});
			if (user) {
				org_id = user.org_id;
				org_uuid = user.organization?.uuid ?? null;
				swayamm_org_id = user.organization?.swayamm_org_id ?? null;
				organization_name = user.organization?.org_name ?? null;
				state_id = user.organization?.state_id ?? null;
			}
		}

		req.user = {
			id: decoded.id,
			name: decoded.name,
			email: decoded.email,
			roles: decoded.roles ?? [],
			role: decoded.role ?? null,
			roleId: decoded.roleId,
			imageUrl: decoded.avatar,
			org_id,
			org_uuid,
			state_id,
			organization_name,
			isSuperAdmin: decoded.isSuperAdmin,
			swayamm_org_id,
		};

		next();
	} catch (err) {
		return next(new AppError('Invalid or expired token', 401));
	}
};

module.exports = verifyToken;
