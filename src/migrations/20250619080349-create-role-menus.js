'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		// await queryInterface.createTable('RoleMenus', {
		// 	roleId: {
		// 		type: Sequelize.INTEGER,
		// 		allowNull: false,
		// 		references: {
		// 			model: 'Roles',
		// 			key: 'id',
		// 		},
		// 		onDelete: 'CASCADE',
		// 		primaryKey: true,
		// 	},
		// 	menuId: {
		// 		type: Sequelize.INTEGER,
		// 		allowNull: false,
		// 		references: {
		// 			model: 'Menus',
		// 			key: 'id',
		// 		},
		// 		onDelete: 'CASCADE',
		// 		primaryKey: true,
		// 	},
		// 	createdAt: {
		// 		allowNull: false,
		// 		type: Sequelize.DATE,
		// 		defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
		// 	},
		// 	updatedAt: {
		// 		allowNull: false,
		// 		type: Sequelize.DATE,
		// 		defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
		// 	},
		// });
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('RoleMenus');
	},
};
