'use strict';

const ADMIN_CODES = ['org_admin', 'app_admin'];

// slug → actions granted for restricted roles
const ORG_ADMIN_ACCESS = {
	dashboard: [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],

	// Masters
	'sub-head': [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],
	'major-head': [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],
	'sub-head-amount': [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],
	'cost-center': [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],
	'major-head-amount': [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],
	period: [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],

	profile: [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],
	transporters: [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],
	organization: [],

	'purchase-order': [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],

	// Roles & Permissions
	'roles-permissions': ['api_read'],
	'roles-permissions-list': [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],
	'users-roles': [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],
	roles: ['view', 'create', 'edit', 'delete', 'export', 'approver', 'api_read'],

	// Transaction
	'rate-contract': [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],
	budget: [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],
	indent: [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],

	users: ['view', 'create', 'edit', 'delete', 'export', 'approver', 'api_read'],
};

const APP_ADMIN_ACCESS = {
	dashboard: [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],

	// Masters (only view + create + api_read)
	'sub-head': ['view', 'create', 'api_read'],
	'major-head': ['view', 'create', 'api_read'],
	'sub-head-amount': ['view', 'create', 'api_read'],
	'cost-center': ['view', 'create', 'api_read'],
	'major-head-amount': ['view', 'create', 'api_read'],
	period: ['view', 'create', 'api_read'],
	transporters: ['view', 'create', 'api_read'],

	profile: [
		'view',
		'create',
		'edit',
		'delete',
		'export',
		'approver',
		'api_read',
	],

	organization: ['api_read'],

	'purchase-order': ['view', 'create'],

	// Roles & Permissions (no access)
	'roles-permissions': [],
	'roles-permissions-list': [],
	'users-roles': [],
	roles: [],

	// Transaction (only view + api_read)
	'rate-contract': ['view', 'api_read'],
	budget: ['view', 'api_read'],
	indent: ['view', 'api_read'],

	users: ['api_read'],
};

const BUDGET_ENTRY_ACCESS = {
	dashboard: ['view', 'api_read'],
	// Masters
	'major-head': ['api_read'],
	'major-head-amount': ['api_read'],
	period: ['api_read'],
	'sub-head': ['api_read'],
	'sub-head-amount': ['api_read'],
	'cost-center': ['api_read'],
	'terms-conditions': ['api_read'],
	transporters: ['api_read'],

	profile: ['view', 'edit', 'api_read'],

	organization: ['api_read'],
	users: ['api_read'],

	// Transaction
	budget: ['view', 'create', 'edit', 'api_read'],
	indent: ['view', 'create', 'edit', 'api_read'],
	'rate-contract': ['view', 'create', 'edit', 'api_read'],
};

const BUDGET_APPROVER_ACCESS = {
	dashboard: ['view', 'api_read'],
	// Masters
	'major-head': ['api_read'],
	'major-head-amount': ['api_read'],
	period: ['api_read'],
	'sub-head': ['api_read'],
	'sub-head-amount': ['api_read'],
	'cost-center': ['api_read'],
	'terms-conditions': ['api_read'],
	transporters: ['api_read'],

	profile: ['view', 'edit', 'api_read'],

	organization: ['api_read'],
	users: ['api_read'],

	// Transaction
	budget: ['view', 'approver', 'api_read'],
	indent: ['view', 'approver', 'api_read'],
	'rate-contract': ['view', 'approver', 'api_read'],
};

const INDENT_VERIFIER_ACCESS = {
	dashboard: ['view', 'api_read'],
	// Masters
	'major-head': ['api_read'],
	'major-head-amount': ['api_read'],
	period: ['api_read'],
	'sub-head': ['api_read'],
	'sub-head-amount': ['api_read'],
	'cost-center': ['api_read'],
	'terms-conditions': ['api_read'],
	transporters: ['api_read'],

	profile: ['view', 'edit', 'api_read'],

	organization: ['api_read'],
	users: ['api_read'],

	// Transaction
	budget: ['api_read'],
	indent: ['view', 'approver', 'api_read'],
	'rate-contract': ['api_read'],
};

const RESTRICTED_ACCESS = {
	org_admin: ORG_ADMIN_ACCESS,
	app_admin: APP_ADMIN_ACCESS,
	budget_entry: BUDGET_ENTRY_ACCESS,
	budget_approver: BUDGET_APPROVER_ACCESS,
	indent_verifier: INDENT_VERIFIER_ACCESS,
};

module.exports = {
	async up(queryInterface, Sequelize) {
		// 1. Load all roles (skip super_admin)
		const roles = await queryInterface.sequelize.query(
			`SELECT id, code FROM Roles WHERE code != 'super_admin'`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		if (!roles.length) return;

		// 2. Load all permissions with their menu slug
		const permissions = await queryInterface.sequelize.query(
			`SELECT p.id, p.action, m.slug
       FROM Permissions p
       JOIN Menus m ON p.menu_id = m.id
       WHERE m.isActive = 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		if (!permissions.length) return;

		// 3. Build lookup: { slug: { action: permissionId } }
		const permMap = {};
		for (const p of permissions) {
			if (!permMap[p.slug]) permMap[p.slug] = {};
			permMap[p.slug][p.action] = p.id;
		}

		const allPermissionIds = permissions.map((p) => p.id);
		const rows = [];

		for (const role of roles) {
			// if (ADMIN_CODES.includes(role.code)) {
			// 	// Admins get every permission
			// 	for (const permId of allPermissionIds) {
			// 		rows.push({ role_id: role.id, permission_id: permId });
			// 	}
			// } else {
			const accessMap = RESTRICTED_ACCESS[role.code];
			if (!accessMap) continue; // unknown role — skip

			for (const [slug, actions] of Object.entries(accessMap)) {
				const slugPerms = permMap[slug];
				if (!slugPerms) continue; // menu may not exist in this env

				for (const action of actions) {
					const permId = slugPerms[action];
					if (permId) rows.push({ role_id: role.id, permission_id: permId });
				}
			}
			// }
		}

		if (rows.length) {
			await queryInterface.bulkInsert('role_permissions', rows, {
				ignoreDuplicates: true,
			});
		}
	},

	async down(queryInterface) {
		// Remove only the rows we seeded (all non-super_admin role permissions)
		await queryInterface.sequelize.query(
			`DELETE rp FROM role_permissions rp
       JOIN Roles r ON rp.role_id = r.id
       WHERE r.code != 'super_admin'`,
		);
	},
};
