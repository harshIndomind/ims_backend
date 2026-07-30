'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		const NEW_ACTIONS = ['dispatch', 'acknowledge'];
		for (const slug of ['purchase-order', 'work-order']) {
			const [menu] = await queryInterface.sequelize.query(
				`SELECT id FROM Menus WHERE slug = '${slug}' LIMIT 1`,
				{ type: Sequelize.QueryTypes.SELECT },
			);
			if (!menu) continue;

			const existing = await queryInterface.sequelize.query(
				`SELECT action FROM Permissions WHERE menu_id = ${menu.id} AND action IN (${NEW_ACTIONS.map((a) => `'${a}'`).join(',')})`,
				{ type: Sequelize.QueryTypes.SELECT },
			);
			const existingActions = new Set(existing.map((p) => p.action));
			const toInsert = NEW_ACTIONS.filter((a) => !existingActions.has(a)).map((action) => ({
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
		const NEW_ACTIONS = ['dispatch', 'acknowledge'];
		for (const slug of ['purchase-order', 'work-order']) {
			const [menu] = await queryInterface.sequelize.query(
				`SELECT id FROM Menus WHERE slug = '${slug}' LIMIT 1`,
				{ type: Sequelize.QueryTypes.SELECT },
			);
			if (!menu) continue;
			await queryInterface.bulkDelete('Permissions', { menu_id: menu.id, action: NEW_ACTIONS }, {});
		}
	},
};
