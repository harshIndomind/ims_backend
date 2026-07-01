'use strict';

// Reopen/Archive are admin-level lifecycle actions (not part of the normal verify/approve
// chain) — granted to the same admin roles that already hold cancel, mirroring
// 20260627000013-grant-indent-cancel-to-admins.js.
const ADMIN_ROLE_CODES = ['org_admin', 'app_admin'];
const NEW_ACTIONS = ['reopen', 'archive'];

module.exports = {
	async up(queryInterface, Sequelize) {
		const [indentMenu] = await queryInterface.sequelize.query(
			`SELECT id FROM Menus WHERE slug = 'indent' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (!indentMenu) return;

		const permissions = await queryInterface.sequelize.query(
			`SELECT id, action FROM Permissions WHERE menu_id = ${indentMenu.id} AND action IN (${NEW_ACTIONS.map((a) => `'${a}'`).join(',')})`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (!permissions.length) return;

		const roles = await queryInterface.sequelize.query(
			`SELECT id FROM Roles WHERE code IN (${ADMIN_ROLE_CODES.map((c) => `'${c}'`).join(',')})`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (!roles.length) return;

		const rows = [];
		for (const role of roles) {
			for (const permission of permissions) {
				rows.push({ role_id: role.id, permission_id: permission.id });
			}
		}

		await queryInterface.bulkInsert('role_permissions', rows, { ignoreDuplicates: true });
	},
	async down(queryInterface, Sequelize) {
		const [indentMenu] = await queryInterface.sequelize.query(
			`SELECT id FROM Menus WHERE slug = 'indent' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (!indentMenu) return;

		await queryInterface.sequelize.query(
			`DELETE rp FROM role_permissions rp
			 JOIN Permissions p ON rp.permission_id = p.id
			 JOIN Roles r ON rp.role_id = r.id
			 WHERE p.menu_id = ${indentMenu.id} AND p.action IN (${NEW_ACTIONS.map((a) => `'${a}'`).join(',')})
			   AND r.code IN (${ADMIN_ROLE_CODES.map((c) => `'${c}'`).join(',')})`,
		);
	},
};
