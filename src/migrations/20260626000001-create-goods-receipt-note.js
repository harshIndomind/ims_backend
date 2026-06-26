'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('GoodsReceiptNotes', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_id: {
				type: Sequelize.INTEGER,
				references: { model: 'organizations', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			purchase_order_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'PurchaseOrders', key: 'id' },
				onDelete: 'CASCADE',
			},
			grnPrefix: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			grnNo: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			grnPostfix: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			grn_date: {
				type: Sequelize.DATEONLY,
				allowNull: false,
			},
			remarks: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			received_by: {
				type: Sequelize.JSON,
				allowNull: true,
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

		await queryInterface.addIndex('GoodsReceiptNotes', ['org_id', 'purchase_order_id']);
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('GoodsReceiptNotes');
	},
};
