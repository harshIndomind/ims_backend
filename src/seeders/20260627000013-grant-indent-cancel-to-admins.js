'use strict';

// 'cancel' is a brand-new action (added by 20260627000009-add-workflow-action-permissions)
// that didn't exist when the original admin-access seeder (20260425000000) ran, so
// org_admin/app_admin never got a row for it even though their access maps are meant to be
// full-CRUD on the indent menu. Grant it here.
const ADMIN_ROLE_CODES = ['org_admin', 'app_admin'];

module.exports = {
	async up(queryInterface, Sequelize) {
		const [indentMenu] = await queryInterface.sequelize.query(
			`SELECT id FROM Menus WHERE slug = 'indent' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		const [cancelPermission] = await queryInterface.sequelize.query(
			`SELECT id FROM Permissions WHERE menu_id = ${indentMenu.id} AND action = 'cancel' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (!cancelPermission) return;

		const roles = await queryInterface.sequelize.query(
			`SELECT id FROM Roles WHERE code IN (${ADMIN_ROLE_CODES.map((c) => `'${c}'`).join(',')})`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (!roles.length) return;

		await queryInterface.bulkInsert(
			'role_permissions',
			roles.map((role) => ({ role_id: role.id, permission_id: cancelPermission.id })),
			{ ignoreDuplicates: true },
		);
	},
	async down(queryInterface, Sequelize) {
		const [indentMenu] = await queryInterface.sequelize.query(
			`SELECT id FROM Menus WHERE slug = 'indent' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		await queryInterface.sequelize.query(
			`DELETE rp FROM role_permissions rp
			 JOIN Permissions p ON rp.permission_id = p.id
			 JOIN Roles r ON rp.role_id = r.id
			 WHERE p.menu_id = ${indentMenu.id} AND p.action = 'cancel'
			   AND r.code IN (${ADMIN_ROLE_CODES.map((c) => `'${c}'`).join(',')})`,
		);
	},
};
