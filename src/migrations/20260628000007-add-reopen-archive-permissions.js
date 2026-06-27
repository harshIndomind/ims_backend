'use strict';

const NEW_ACTIONS = ['reopen', 'archive'];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		const [indentMenu] = await queryInterface.sequelize.query(
			`SELECT id FROM Menus WHERE slug = 'indent' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		if (!indentMenu) return; // indent menu may not exist in this env — nothing to grant

		const permissions = NEW_ACTIONS.map((action) => ({
			menu_id: indentMenu.id,
			action,
			createdAt: new Date(),
			updatedAt: new Date(),
		}));

		await queryInterface.bulkInsert('Permissions', permissions, {});
	},
	async down(queryInterface, Sequelize) {
		const [indentMenu] = await queryInterface.sequelize.query(
			`SELECT id FROM Menus WHERE slug = 'indent' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (!indentMenu) return;

		await queryInterface.bulkDelete(
			'Permissions',
			{ menu_id: indentMenu.id, action: NEW_ACTIONS },
			{},
		);
	},
};
