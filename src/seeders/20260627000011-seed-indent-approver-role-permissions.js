'use strict';

// Mirrors INDENT_VERIFIER_ACCESS's base navigation grants in 20260425000000-seed-role-permissions.js,
// but with the split verify/approve/reject actions instead of the old combined 'approver' action.
const INDENT_APPROVER_ACCESS = {
	dashboard: ['view', 'api_read'],
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
	budget: ['api_read'],
	indent: ['view', 'approve', 'reject', 'api_read'],
	'rate-contract': ['api_read'],
};

async function grantsFor(queryInterface, Sequelize, accessMap) {
	const permissions = await queryInterface.sequelize.query(
		`SELECT p.id, p.action, m.slug FROM Permissions p JOIN Menus m ON p.menu_id = m.id WHERE m.isActive = 1`,
		{ type: Sequelize.QueryTypes.SELECT },
	);
	const permMap = {};
	for (const p of permissions) {
		if (!permMap[p.slug]) permMap[p.slug] = {};
		permMap[p.slug][p.action] = p.id;
	}

	const ids = [];
	for (const [slug, actions] of Object.entries(accessMap)) {
		const slugPerms = permMap[slug];
		if (!slugPerms) continue;
		for (const action of actions) {
			if (slugPerms[action]) ids.push(slugPerms[action]);
		}
	}
	return ids;
}

module.exports = {
	async up(queryInterface, Sequelize) {
		const [approverRole] = await queryInterface.sequelize.query(
			`SELECT id FROM Roles WHERE code = 'indent_approver' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		const [verifierRole] = await queryInterface.sequelize.query(
			`SELECT id FROM Roles WHERE code = 'indent_verifier' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		if (approverRole) {
			const permissionIds = await grantsFor(queryInterface, Sequelize, INDENT_APPROVER_ACCESS);
			if (permissionIds.length) {
				await queryInterface.bulkInsert(
					'role_permissions',
					permissionIds.map((permission_id) => ({ role_id: approverRole.id, permission_id })),
					{ ignoreDuplicates: true },
				);
			}
		}

		// indent_verifier previously held the combined 'approver' action (which gated the
		// old merged verify+approve endpoint). Now that verify/approve are split, drop
		// 'approver' from its grant and add the new 'verify' + 'reject' actions.
		if (verifierRole) {
			await queryInterface.sequelize.query(
				`DELETE rp FROM role_permissions rp
				 JOIN Permissions p ON rp.permission_id = p.id
				 JOIN Menus m ON p.menu_id = m.id
				 WHERE rp.role_id = ${verifierRole.id} AND m.slug = 'indent' AND p.action = 'approver'`,
			);

			const newVerifierPermIds = await grantsFor(queryInterface, Sequelize, {
				indent: ['verify', 'reject'],
			});
			if (newVerifierPermIds.length) {
				await queryInterface.bulkInsert(
					'role_permissions',
					newVerifierPermIds.map((permission_id) => ({ role_id: verifierRole.id, permission_id })),
					{ ignoreDuplicates: true },
				);
			}
		}

		// Per the architecture doc: permanent delete is restricted to Super Admin only.
		// Super Admin bypasses checkPermission entirely (see middlewares/checkPermission.js),
		// so simply remove the 'delete' grant from every other role that currently holds it
		// for the indent menu (org_admin/app_admin grant 'delete' via ORG_ADMIN_ACCESS/APP_ADMIN_ACCESS).
		await queryInterface.sequelize.query(
			`DELETE rp FROM role_permissions rp
			 JOIN Permissions p ON rp.permission_id = p.id
			 JOIN Menus m ON p.menu_id = m.id
			 JOIN Roles r ON rp.role_id = r.id
			 WHERE m.slug = 'indent' AND p.action = 'delete' AND r.code != 'super_admin'`,
		);
	},

	async down(queryInterface, Sequelize) {
		const [approverRole] = await queryInterface.sequelize.query(
			`SELECT id FROM Roles WHERE code = 'indent_approver' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (approverRole) {
			await queryInterface.bulkDelete('role_permissions', { role_id: approverRole.id }, {});
		}
	},
};
