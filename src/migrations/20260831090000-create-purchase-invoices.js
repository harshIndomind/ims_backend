'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('purchase_invoices', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			// PO/WO polymorphic — mirrors qc_inspections/short_close_requests'
			// document_type + a nullable-pair-of-FKs shape exactly (never both set,
			// never both null; which one is set follows document_type). WO invoices
			// have no MRN to match against, so their line ceiling is QC accepted_qty
			// when the WO requires QC, or the WO item's own ordered qty when it
			// doesn't — see purchase-invoice.service.js's DOC_CONFIG.
			document_type: {
				type: Sequelize.ENUM('purchase_order', 'work_order'),
				allowNull: false,
			},
			purchase_order_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: {
					model: 'PurchaseOrders',
					key: 'id',
				},
			},
			work_order_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: {
					model: 'WorkOrders',
					key: 'id',
				},
			},
			// System-generated document number triple, same pattern as PO/GRN.
			invoicePrefix: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			invoiceNo: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			invoicePostfix: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			// The vendor's own invoice identity — distinct from the system-generated
			// number above, no existing precedent elsewhere in this codebase.
			vendor_invoice_no: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			vendor_invoice_date: {
				type: Sequelize.DATEONLY,
				allowNull: false,
			},
			invoice_date: {
				type: Sequelize.DATEONLY,
				allowNull: false,
			},
			// Snapshot of PurchaseOrder.vendorInfo at invoice-creation time, editable —
			// a vendor's billing GSTIN can legitimately differ from the PO's.
			vendor_snapshot: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			total_taxable: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			total_tax: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			discount: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			otherTax: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			isRoundOff: {
				type: Sequelize.BOOLEAN,
				allowNull: true,
			},
			grandTotal: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			// Header rollup — true when any line's own matching_status is
			// variance_flagged (soft price/tax mismatch vs the PO item snapshot).
			matching_status: {
				type: Sequelize.ENUM('matched', 'variance_flagged'),
				allowNull: false,
				defaultValue: 'matched',
			},
			// Mirrors workflow_instances.status, same convention as
			// short_close_requests.status — always a direct copy, never a second
			// parallel status vocabulary.
			status: {
				type: Sequelize.ENUM('draft', 'in_progress', 'approved', 'rejected', 'cancelled'),
				allowNull: false,
				defaultValue: 'draft',
			},
			remarks: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			created_by: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			approved_by: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			approved_at: {
				type: Sequelize.DATE,
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

		await queryInterface.addIndex('purchase_invoices', ['document_type', 'purchase_order_id'], {
			name: 'purchase_invoices_po_idx',
		});
		await queryInterface.addIndex('purchase_invoices', ['document_type', 'work_order_id'], {
			name: 'purchase_invoices_wo_idx',
		});
		await queryInterface.addIndex('purchase_invoices', ['org_id', 'status'], {
			name: 'purchase_invoices_org_status_idx',
		});
		await queryInterface.addIndex('purchase_invoices', ['org_id', 'invoiceNo'], {
			name: 'purchase_invoices_org_invoice_no_idx',
			unique: true,
		});
	},

	async down(queryInterface) {
		await queryInterface.dropTable('purchase_invoices');
	},
};
