'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('PurchaseOrderSerialItems', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			purchase_order_item_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'PurchaseOrderItems',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			serial_no: {
				type: Sequelize.STRING,
				unique: true,
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
		await queryInterface.dropTable('PurchaseOrderSerialItems');
	},
};
