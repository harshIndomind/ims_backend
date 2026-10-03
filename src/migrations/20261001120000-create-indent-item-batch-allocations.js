'use strict';

/**
 * One row per batch an indent line was actually issued from (approval or re-issue). A batch
 * line can now be split across batches by VCP's FEFO allocator, which a single
 * IndentItems.batch_id can't represent. Lines issued before this table have no rows; their
 * cancel/delete rollback falls back to IndentItems.batch_id exactly as before.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('IndentItemBatchAllocations', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			indent_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			indent_item_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'IndentItems', key: 'id' },
				onDelete: 'CASCADE',
			},
			product_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			// VCP ProductBatch id (cross-service, no FK).
			batch_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			batch_no: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			expiry_date: {
				type: Sequelize.DATEONLY,
				allowNull: true,
			},
			// In the indent line's UOM.
			qty: {
				type: Sequelize.DECIMAL(18, 6),
				allowNull: false,
			},
			base_qty: {
				type: Sequelize.DECIMAL(18, 6),
				allowNull: false,
			},
			// VCP StockLedger id of the INDENT_ISSUE row.
			stock_ledger_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			issued_via: {
				type: Sequelize.STRING(20),
				allowNull: false,
			},
			issued_at: {
				type: Sequelize.DATE,
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
		await queryInterface.addIndex('IndentItemBatchAllocations', ['indent_item_id']);
		await queryInterface.addIndex('IndentItemBatchAllocations', ['batch_id']);
	},

	async down(queryInterface) {
		await queryInterface.dropTable('IndentItemBatchAllocations');
	},
};
