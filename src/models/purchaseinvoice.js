'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class PurchaseInvoice extends Model {
		static associate(models) {
			PurchaseInvoice.belongsTo(models.PurchaseOrder, {
				foreignKey: 'purchase_order_id',
				as: 'purchaseOrder',
			});
			PurchaseInvoice.belongsTo(models.WorkOrder, {
				foreignKey: 'work_order_id',
				as: 'workOrder',
			});
			// Which MRN/QC (if any) this invoice was originally looked up/scoped
			// from — display-only (traceability + creation-date lookup), the
			// qty ceiling itself is always recomputed live off po_wo_item_id
			// regardless of which single MRN/QC these point at.
			PurchaseInvoice.belongsTo(models.GoodsReceiptNote, {
				foreignKey: 'mrn_id',
				as: 'mrn',
			});
			PurchaseInvoice.belongsTo(models.QcInspection, {
				foreignKey: 'qc_id',
				as: 'qcInspection',
			});
			PurchaseInvoice.hasMany(models.PurchaseInvoiceItem, {
				foreignKey: 'purchase_invoice_id',
				as: 'items',
			});
			PurchaseInvoice.hasMany(models.PurchaseInvoiceCharge, {
				foreignKey: 'purchase_invoice_id',
				as: 'charges',
			});
			PurchaseInvoice.hasMany(models.PaymentRequisition, {
				foreignKey: 'purchase_invoice_id',
				as: 'paymentRequisitions',
			});
			PurchaseInvoice.hasMany(models.PurchaseInvoiceDocument, {
				foreignKey: 'purchase_invoice_id',
				as: 'documents',
			});
		}
	}
	PurchaseInvoice.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			document_type: {
				type: DataTypes.ENUM('purchase_order', 'work_order'),
				allowNull: false,
			},
			purchase_order_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			work_order_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			mrn_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			qc_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			invoicePrefix: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			invoiceNo: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			invoicePostfix: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			vendor_invoice_no: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			vendor_invoice_date: {
				type: DataTypes.DATEONLY,
				allowNull: false,
			},
			invoice_date: {
				type: DataTypes.DATEONLY,
				allowNull: false,
			},
			vendor_snapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			total_taxable: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			total_tax: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			discount: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			otherTax: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			isRoundOff: {
				type: DataTypes.BOOLEAN,
				allowNull: true,
			},
			// The +/- adjustment applied to reach grandTotal when isRoundOff is
			// true (0 otherwise) — kept separate so it always renders as its own
			// line rather than being silently absorbed into total_tax/total_taxable.
			round_off_amount: {
				type: DataTypes.DECIMAL(10, 2),
				allowNull: false,
				defaultValue: 0,
			},
			grandTotal: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			matching_status: {
				type: DataTypes.ENUM('matched', 'variance_flagged'),
				allowNull: false,
				defaultValue: 'matched',
			},
			status: {
				type: DataTypes.ENUM('draft', 'in_progress', 'approved', 'rejected', 'cancelled'),
				allowNull: false,
				defaultValue: 'draft',
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			created_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			approved_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			approved_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'PurchaseInvoice',
			tableName: 'purchase_invoices',
		},
	);
	return PurchaseInvoice;
};
