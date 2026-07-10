const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const { JWT_ACCESS_SECRET } = require('../config/serverConfig');
const { User, organization, Department } = require('../models/index');

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
		let local_user_id = null;
		let local_user_name = null;
		// department_id and unit_id are not in the JWT — loaded from DB for
		// role-based data visibility (DataVisibilityService).
		let local_department_id = null;
		let local_unit_id = null;
		// depCd is the cross-unit logical department code (e.g. 'DA001').
		// Stored here so DataVisibilityService can find all unit-specific
		// department_ids that share this code without an extra DB round-trip.
		let local_dep_cd = null;

		// Reusable Department include — fetches only depCd via a single LEFT JOIN.
		const departmentInclude = {
			model: Department,
			attributes: ['depCd'],
			required: false,
		};

		if (org_uuid) {
			// New tokens: resolve local org_id from the shared org UUID,
			// and local user id from the shared user UUID (sub)
			const [org, localUser] = await Promise.all([
				organization.findOne({
					where: { uuid: org_uuid },
					attributes: ['id', 'swayamm_org_id', 'org_name', 'state_id'],
				}),
				decoded.sub
					? User.findOne({
						where: { uuid: decoded.sub },
						attributes: ['id', 'name', 'department_id', 'unit_id'],
						include: [departmentInclude],
					})
					: null,
			]);
			if (org) {
				org_id = org.id;
				swayamm_org_id = org.swayamm_org_id;
				organization_name = org.org_name;
				state_id = org.state_id;
			}
			if (localUser) {
				local_user_id = localUser.id;
				local_user_name = localUser.name;
				local_department_id = localUser.department_id ?? null;
				local_unit_id = localUser.unit_id ?? null;
				local_dep_cd = localUser.Department?.depCd ?? null;
			}
		} else if (decoded.sub) {
			// Old tokens without org_uuid: resolve via local user record using user UUID
			const user = await User.findOne({
				where: { uuid: decoded.sub },
				include: [
					{ model: organization, as: 'organization', required: false },
					departmentInclude,
				],
				attributes: ['id', 'name', 'org_id', 'department_id', 'unit_id'],
			});
			if (user) {
				local_user_id = user.id;
				local_user_name = user.name;
				org_id = user.org_id;
				org_uuid = user.organization?.uuid ?? null;
				swayamm_org_id = user.organization?.swayamm_org_id ?? null;
				organization_name = user.organization?.org_name ?? null;
				state_id = user.organization?.state_id ?? null;
				local_department_id = user.department_id ?? null;
				local_unit_id = user.unit_id ?? null;
				local_dep_cd = user.Department?.depCd ?? null;
			}
		}

		req.user = {
			sub: decoded.sub,
			id: local_user_id ?? decoded.id,
			// Cross-app tokens minted by auth-backend's own login don't carry `name` —
			// fall back to the local User record resolved above.
			name: decoded.name ?? local_user_name,
			email: decoded.email,
			roles: decoded.roles ?? [],
			role: decoded.role ?? null,
			roleId: decoded?.roleId ?? null,
			imageUrl: decoded.avatar,
			org_id,
			org_uuid,
			state_id,
			organization_name,
			// Cross-app tokens minted by auth-backend don't carry isSuperAdmin, only roles
			isSuperAdmin: decoded.isSuperAdmin ?? (decoded.roles ?? []).includes('super_admin'),
			swayamm_org_id,
			// Resolved from local User record — used by DataVisibilityService for
			// cross-unit department-scoped filtering. dep_cd is the logical department
			// code shared across all unit-specific department rows (e.g. 'DA001').
			// unit_id kept for future unit+dept combined filtering.
			department_id: local_department_id,
			dep_cd: local_dep_cd,
			unit_id: local_unit_id,
		};

		next();
	} catch (err) {
		return next(new AppError('Invalid or expired token', 401));
	}
};

module.exports = verifyToken;
