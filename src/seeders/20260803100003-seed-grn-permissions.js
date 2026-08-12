'use strict';

/**
 * GRN (`goods-receipt-note`) has had a Menus row since it shipped but never had any
 * Permissions/role_permissions — its routes only ever checked verifyToken (see
 * grn.routes.js before this change), unlike every other module. Backfilling this alongside
 * the QC gate rather than filing it separately, since QC gating GRN creation is exactly the
 * moment that gap stops being tolerable (an ungated route that's about to also decide whether
 * QC was satisfied needs the same protection every other write-route already has).
 */
const ACTIONS = ['view', 'create', 'cancel'];

const ROLE_ACTIONS = {
	org_admin: ACTIONS,
	app_admin: ['view', 'create'],
};

module.exports = {
	async up(queryInterface, Sequelize) {
		const [menu] = await queryInterface.sequelize.query(`SELECT id FROM Menus WHERE slug = 'goods-receipt-note' LIMIT 1`, {
			type: Sequelize.QueryTypes.SELECT,
		});
		if (!menu) return;

		const existingPerms = await queryInterface.sequelize.query(`SELECT action FROM Permissions WHERE menu_id = ?`, {
			replacements: [menu.id],
			type: Sequelize.QueryTypes.SELECT,
		});
		const existingActions = new Set(existingPerms.map((p) => p.action));

		const newPermissions = ACTIONS.filter((action) => !existingActions.has(action)).map((action) => ({
			menu_id: menu.id,
			action,
			createdAt: new Date(),
			updatedAt: new Date(),
		}));

		if (newPermissions.length) {
			await queryInterface.bulkInsert('Permissions', newPermissions, {});
		}

		const permissions = await queryInterface.sequelize.query(`SELECT id, action FROM Permissions WHERE menu_id = ?`, {
			replacements: [menu.id],
			type: Sequelize.QueryTypes.SELECT,
		});
		const permIdByAction = {};
		permissions.forEach((p) => {
			permIdByAction[p.action] = p.id;
		});

		const roles = await queryInterface.sequelize.query(`SELECT id, code FROM Roles WHERE code != 'super_admin'`, {
			type: Sequelize.QueryTypes.SELECT,
		});

		const rows = [];
		for (const role of roles) {
			const actions = ROLE_ACTIONS[role.code];
			if (!actions) continue;
			for (const action of actions) {
				const permId = permIdByAction[action];
				if (permId) rows.push({ role_id: role.id, permission_id: permId });
			}
		}

		if (rows.length) {
			await queryInterface.bulkInsert('role_permissions', rows, { ignoreDuplicates: true });
		}
	},

	async down(queryInterface, Sequelize) {
		const [menu] = await queryInterface.sequelize.query(`SELECT id FROM Menus WHERE slug = 'goods-receipt-note' LIMIT 1`, {
			type: Sequelize.QueryTypes.SELECT,
		});
		if (!menu) return;

		await queryInterface.sequelize.query(
			`DELETE rp FROM role_permissions rp
       JOIN Permissions p ON rp.permission_id = p.id
       WHERE p.menu_id = ?`,
			{ replacements: [menu.id] },
		);
		await queryInterface.bulkDelete('Permissions', { menu_id: menu.id, action: ACTIONS }, {});
	},
};
