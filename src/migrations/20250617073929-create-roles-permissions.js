'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('RolesPermissions', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			roleId: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'Roles',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			permissionId: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'Permissions',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
			updatedAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
		});
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('RolesPermissions');
	},
};
