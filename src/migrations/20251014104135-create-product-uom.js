'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('ProductUOMs', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			product_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'Products', key: 'id' },
				onDelete: 'CASCADE',
			},
			unit_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'Units', key: 'id' },
			},
			qty: {
				type: Sequelize.DECIMAL(12, 2),
				allowNull: false,
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
		await queryInterface.dropTable('ProductUOMs');
	},
};
