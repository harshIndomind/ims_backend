'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class PurchaseInvoiceCharge extends Model {
		static associate(models) {
			PurchaseInvoiceCharge.belongsTo(models.PurchaseInvoice, {
				foreignKey: 'purchase_invoice_id',
				as: 'purchaseInvoice',
			});
			PurchaseInvoiceCharge.belongsTo(models.MasterOtherChargeType, {
				foreignKey: 'charge_type_id',
				as: 'chargeType',
			});
		}
	}
	PurchaseInvoiceCharge.init(
		{
			purchase_invoice_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			charge_type_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			description: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			amount: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
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
			// Whether this charge's own (amount, tax) folds into the invoice's
			// total_taxable/total_tax like an item ('pre_tax'), or lands as its
			// own lump sum directly on grandTotal, bypassing total_taxable/
			// total_tax entirely ('post_tax' — e.g. TCS, added on the already-
			// tax-inclusive invoice value). Either way amount is always the
			// taxable value and tax is always added on top of it — this flag
			// only decides which aggregate bucket the result lands in, see
			// purchase-invoice.service.js's totalTaxable/totalTax/rawGrandTotal.
			charge_basis: {
				type: DataTypes.ENUM('pre_tax', 'post_tax'),
				allowNull: false,
				defaultValue: 'pre_tax',
			},
			// Whether `amount` is a flat rupee figure or a percentage (resolved
			// client-side against the invoice's items-only total before this row
			// is submitted — amount itself is always the raw, unsigned entered
			// number regardless of value_type).
			value_type: {
				type: DataTypes.ENUM('rupee', 'percentage'),
				allowNull: false,
				defaultValue: 'rupee',
			},
			// Whether this charge adds to or subtracts from the grand total.
			// total/igst/cgst/sgst/cess already carry the resulting sign — this
			// is purely a record of intent alongside them.
			operation_type: {
				type: DataTypes.ENUM('+', '-'),
				allowNull: false,
				defaultValue: '+',
			},
			total: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			// Nullable — see the migration comment. Set on every charge created via the
			// shared <ChargesTable> UI (replacing the old tax_id/master-lookup approach for
			// picking a charge's tax rate); null on charges from before that switch.
			tax_treatment: {
				type: DataTypes.ENUM('NON_TAXABLE', 'SPECIFIC_RATE', 'INHERIT_ITEM_TAX'),
				allowNull: true,
			},
			tax_rate: {
				type: DataTypes.DECIMAL(5, 2),
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'PurchaseInvoiceCharge',
			tableName: 'purchase_invoice_charges',
		},
	);
	return PurchaseInvoiceCharge;
};
