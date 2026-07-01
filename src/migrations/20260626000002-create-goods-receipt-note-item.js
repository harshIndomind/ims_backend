'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('GoodsReceiptNoteItems', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			goods_receipt_note_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'GoodsReceiptNotes', key: 'id' },
				onDelete: 'CASCADE',
			},
			purchase_order_item_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'PurchaseOrderItems', key: 'id' },
				onDelete: 'CASCADE',
			},
			product_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			batch_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			stock_type: {
				type: Sequelize.ENUM(['normal', 'batch', 'serial']),
				allowNull: true,
			},
			received_qty: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
			},
			serial_nos: {
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

		await queryInterface.addIndex('GoodsReceiptNoteItems', ['purchase_order_item_id']);
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('GoodsReceiptNoteItems');
	},
};
