'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('Menus', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			parentId: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: {
					model: 'Menus',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			menuName: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			icon: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			url: {
				type: Sequelize.STRING,
			},
			isActive: {
				type: Sequelize.BOOLEAN,
				defaultValue: true,
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
		await queryInterface.dropTable('Menus');
	},
};
