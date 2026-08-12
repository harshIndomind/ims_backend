'use strict';

const ACTIONS = ['view', 'create', 'approve', 'reject', 'cancel'];

// Mirrors seed-quality-control-menu-permissions.js's shape: org_admin gets everything,
// app_admin gets the same view/create(+cancel-own) baseline it holds on purchase-order
// (20260425000000-seed-role-permissions.js — PO 'create' is currently org_admin/app_admin
// only, no separate procurement-officer "maker" role exists yet), and the new
// short_close_approver role (20260808140003-add-short-close-approver-role.js) is scoped to
// exactly the approval-stage actions, same as qc_approver/po_approver/wo_approver.
const ROLE_ACTIONS = {
	org_admin: ACTIONS,
	app_admin: ['view', 'create', 'cancel'],
	short_close_approver: ['view', 'approve', 'reject', 'cancel'],
};

module.exports = {
	async up(queryInterface, Sequelize) {
		const existingMenu = await queryInterface.sequelize.query(`SELECT id FROM Menus WHERE slug = 'short-close'`, {
			type: Sequelize.QueryTypes.SELECT,
		});

		let menuId;
		if (existingMenu.length) {
			menuId = existingMenu[0].id;
		} else {
			const [transactionParent] = await queryInterface.sequelize.query(
				`SELECT id FROM Menus WHERE slug = 'transaction' LIMIT 1`,
				{ type: Sequelize.QueryTypes.SELECT },
			);

			await queryInterface.bulkInsert('Menus', [
				{
					parentId: transactionParent?.id ?? null,
					menuName: 'Short Close',
					icon: null,
					url: '/short-close',
					slug: 'short-close',
					showInSidebar: true,
					isActive: 1,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			]);

			const inserted = await queryInterface.sequelize.query(`SELECT id FROM Menus WHERE slug = 'short-close'`, {
				type: Sequelize.QueryTypes.SELECT,
			});
			menuId = inserted[0].id;
		}

		const existingPerms = await queryInterface.sequelize.query(`SELECT action FROM Permissions WHERE menu_id = ?`, {
			replacements: [menuId],
			type: Sequelize.QueryTypes.SELECT,
		});
		const existingActions = new Set(existingPerms.map((p) => p.action));

		const newPermissions = ACTIONS.filter((action) => !existingActions.has(action)).map((action) => ({
			menu_id: menuId,
			action,
			createdAt: new Date(),
			updatedAt: new Date(),
		}));

		if (newPermissions.length) {
			await queryInterface.bulkInsert('Permissions', newPermissions, {});
		}

		const permissions = await queryInterface.sequelize.query(`SELECT id, action FROM Permissions WHERE menu_id = ?`, {
			replacements: [menuId],
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
		const menu = await queryInterface.sequelize.query(`SELECT id FROM Menus WHERE slug = 'short-close'`, {
			type: Sequelize.QueryTypes.SELECT,
		});
		if (!menu.length) return;
		const menuId = menu[0].id;

		await queryInterface.sequelize.query(
			`DELETE rp FROM role_permissions rp
       JOIN Permissions p ON rp.permission_id = p.id
       WHERE p.menu_id = ?`,
			{ replacements: [menuId] },
		);
		await queryInterface.bulkDelete('Permissions', { menu_id: menuId }, {});
		await queryInterface.bulkDelete('Menus', { id: menuId }, {});
	},
};
