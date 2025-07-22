'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('menu_permissions', {
			menu_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'Menus',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			permission_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'Permissions',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			createdAt: Sequelize.DATE,
			updatedAt: Sequelize.DATE,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('menu_permissions');
	},
};
