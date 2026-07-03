'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		// Roles
		const existingRoles = await queryInterface.sequelize.query(
			`SELECT code FROM Roles WHERE code IN ('po_approver', 'wo_approver')`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		const existingCodes = new Set(existingRoles.map((r) => r.code));

		const rolesToInsert = [];
		if (!existingCodes.has('po_approver')) {
			rolesToInsert.push({
				name: 'PO Approver',
				code: 'po_approver',
				description: 'Final approval stage for Purchase Orders.',
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}
		if (!existingCodes.has('wo_approver')) {
			rolesToInsert.push({
				name: 'WO Approver',
				code: 'wo_approver',
				description: 'Final approval stage for Work Orders.',
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}
		if (rolesToInsert.length) {
			await queryInterface.bulkInsert('Roles', rolesToInsert);
		}

		// Permissions — one set per document menu slug
		const WORKFLOW_ACTIONS = ['approve', 'reject', 'cancel', 'reopen', 'archive'];
		for (const slug of ['purchase-order', 'work-order']) {
			const [menu] = await queryInterface.sequelize.query(
				`SELECT id FROM Menus WHERE slug = '${slug}' LIMIT 1`,
				{ type: Sequelize.QueryTypes.SELECT },
			);
			if (!menu) continue;

			const existing = await queryInterface.sequelize.query(
				`SELECT action FROM Permissions WHERE menu_id = ${menu.id} AND action IN (${WORKFLOW_ACTIONS.map((a) => `'${a}'`).join(',')})`,
				{ type: Sequelize.QueryTypes.SELECT },
			);
			const existingActions = new Set(existing.map((p) => p.action));
			const toInsert = WORKFLOW_ACTIONS.filter((a) => !existingActions.has(a)).map((action) => ({
				menu_id: menu.id,
				action,
				createdAt: new Date(),
				updatedAt: new Date(),
			}));
			if (toInsert.length) {
				await queryInterface.bulkInsert('Permissions', toInsert);
			}
		}
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.bulkDelete('Roles', { code: ['po_approver', 'wo_approver'] }, {});

		const WORKFLOW_ACTIONS = ['approve', 'reject', 'cancel', 'reopen', 'archive'];
		for (const slug of ['purchase-order', 'work-order']) {
			const [menu] = await queryInterface.sequelize.query(
				`SELECT id FROM Menus WHERE slug = '${slug}' LIMIT 1`,
				{ type: Sequelize.QueryTypes.SELECT },
			);
			if (!menu) continue;
			await queryInterface.bulkDelete('Permissions', { menu_id: menu.id, action: WORKFLOW_ACTIONS }, {});
		}
	},
};
