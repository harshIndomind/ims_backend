'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('purchase_invoice_items', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			purchase_invoice_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'purchase_invoices',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			// Polymorphic against PurchaseOrderItems/WorkOrderItems depending on the
			// parent invoice's document_type — same shape as
			// short_close_request_items.po_wo_item_id, no formal FK constraint since
			// it targets two different tables.
			po_wo_item_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			product_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			productSnapshot: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			invoiced_qty: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
			},
			price: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
			},
			discount: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: true,
			},
			discount_price_type: {
				type: Sequelize.ENUM('rupee', 'percentage'),
				allowNull: true,
			},
			tax_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			taxSnapshot: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			igst: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
			cgst: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
			sgst: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
			cess: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
			total: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
			},
			// PO item's own price at invoice-creation time, frozen for audit even if
			// the PO is later amended — the baseline the soft variance check compares
			// `price` against.
			po_item_price_snapshot: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: true,
			},
			price_variance_pct: {
				type: Sequelize.DECIMAL(6, 2),
				allowNull: true,
			},
			tax_variance_flag: {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},
			matching_status: {
				type: Sequelize.ENUM('matched', 'variance_flagged'),
				allowNull: false,
				defaultValue: 'matched',
			},
			remarks: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
				defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
			},
			updatedAt: {
				allowNull: true,
				type: Sequelize.DATE,
				defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
			},
		});

		// The column the hard-block invoiced-qty-vs-received/accepted-qty sum filters on.
		await queryInterface.addIndex('purchase_invoice_items', ['po_wo_item_id'], {
			name: 'purchase_invoice_items_po_wo_item_idx',
		});
		await queryInterface.addIndex('purchase_invoice_items', ['purchase_invoice_id'], {
			name: 'purchase_invoice_items_invoice_idx',
		});
	},

	async down(queryInterface) {
		await queryInterface.dropTable('purchase_invoice_items');
	},
};
