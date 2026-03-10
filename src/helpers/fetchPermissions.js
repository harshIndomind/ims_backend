const sequelize = require('../models/index').sequelize;
const { permissionCache } = require('../cache/permissionCache');
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function fetchPermissions(req) {
	const userId = req.user.id;

	console.log('--- fetchPermissions called ---');

	// 1️⃣ Request-level cache
	if (req._permissions) {
		console.log('✅ Served from REQUEST cache');
		return req._permissions;
	}

	// 2️⃣ In-memory cache
	const cached = permissionCache.get(userId);
	if (cached && cached.expiresAt > Date.now()) {
		console.log('🟡 Served from MEMORY cache');
		req._permissions = cached.permissions;
		return cached.permissions;
	}

	// 3️⃣ DB hit
	console.log('🔴 Served from DB');

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
			replacements: [userId],
			type: sequelize.QueryTypes.SELECT,
		},
	);

	const list = permissions.map((p) => p.permission);

	permissionCache.set(userId, {
		permissions: list,
		expiresAt: Date.now() + CACHE_TTL,
	});

	req._permissions = list;
	return list;
}

module.exports = fetchPermissions;
