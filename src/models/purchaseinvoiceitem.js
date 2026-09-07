'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class PurchaseInvoiceItem extends Model {
		static associate(models) {
			PurchaseInvoiceItem.belongsTo(models.PurchaseInvoice, {
				foreignKey: 'purchase_invoice_id',
				as: 'purchaseInvoice',
			});
			// No belongsTo for po_wo_item_id — polymorphic against
			// PurchaseOrderItems/WorkOrderItems depending on the parent invoice's
			// document_type, same as ShortCloseRequestItem.po_wo_item_id.
		}
	}
	PurchaseInvoiceItem.init(
		{
			purchase_invoice_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			po_wo_item_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			product_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			productSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			// The PO/WO item's own productSnapshot never carries UOM data — the
			// real unit lives on its uomSnapshot (e.g. uomSnapshot.unit.name), so
			// this is copied separately at invoice creation to display what unit
			// the line was actually billed in.
			uomSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			// Resolved batch/serial actually received/billed against, captured at
			// invoice creation time — sourced from the MRN (PO) or QC/WO item (WO)
			// that fed this line, not the PO/WO item's own record (which only
			// knows what was originally ordered, not what specific batch/serial
			// actually arrived).
			stock_type: {
				type: DataTypes.ENUM('normal', 'batch', 'serial'),
				allowNull: true,
			},
			batchSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			serial_nos: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			invoiced_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
			},
			price: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
			},
			discount: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: true,
			},
			discount_price_type: {
				type: DataTypes.ENUM('rupee', 'percentage'),
				allowNull: true,
			},
			tax_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			taxSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			igst: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
			cgst: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
			sgst: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
			cess: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
			total: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
			},
			po_item_price_snapshot: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: true,
			},
			price_variance_pct: {
				type: DataTypes.DECIMAL(6, 2),
				allowNull: true,
			},
			tax_variance_flag: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},
			matching_status: {
				type: DataTypes.ENUM('matched', 'variance_flagged'),
				allowNull: false,
				defaultValue: 'matched',
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'PurchaseInvoiceItem',
			tableName: 'purchase_invoice_items',
		},
	);
	return PurchaseInvoiceItem;
};
