'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class CreditNoteInvoiceItem extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			CreditNoteInvoiceItem.belongsTo(models.CreditNoteInvoice, {
				foreignKey: 'credit_note_invoice_id',
				as: 'invoice',
			});
			CreditNoteInvoiceItem.belongsTo(models.Product, {
				foreignKey: 'product_id',
				as: 'product',
				onDelete: 'CASCADE',
			});
			CreditNoteInvoiceItem.belongsTo(models.Tax, {
				foreignKey: 'tax_id',
				as: 'tax',
				onDelete: 'CASCADE',
			});
			CreditNoteInvoiceItem.belongsTo(models.ProductBatch, {
				foreignKey: 'batch_id',
				as: 'batches',
				onDelete: 'CASCADE',
			});
			CreditNoteInvoiceItem.hasMany(models.CreditNoteInvoiceItemSerial, {
				foreignKey: 'credit_note_invoice_item_id',
				as: 'serials',
				onDelete: 'CASCADE',
			});
			CreditNoteInvoiceItem.belongsTo(models.Unit, {
				foreignKey: 'selected_uom_id',
				as: 'selectedUom',
			});
			CreditNoteInvoiceItem.hasMany(models.ProductUOM, {
				foreignKey: 'product_id',
				sourceKey: 'product_id',
				as: 'uoms',
				constraints: false,
			});
		}
	}
	CreditNoteInvoiceItem.init(
		{
			credit_note_invoice_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'CreditNoteInvoices',
					key: 'id',
				},
				allowNull: true,
			},
			product_id: { type: DataTypes.INTEGER, allowNull: true },
			batch_id: { type: DataTypes.INTEGER, allowNull: true },
			hsn_sac_code: { type: DataTypes.STRING, allowNull: true },
			qty: DataTypes.DECIMAL(15, 2),
			price: DataTypes.DECIMAL(15, 2),
			discount: DataTypes.DECIMAL(15, 2),
			discount_price_type: DataTypes.ENUM(['rupee', 'percentage']),
			tax_id: DataTypes.INTEGER,
			igst: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
			cgst: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
			sgst: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
			cess: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
			total: DataTypes.DECIMAL(15, 2),
			stock_type: DataTypes.ENUM(['normal', 'batch', 'serial']),
			note: { type: DataTypes.TEXT, allowNull: true },
			selected_uom_id: { type: DataTypes.INTEGER, allowNull: true },
		},
		{
			sequelize,
			modelName: 'CreditNoteInvoiceItem',
		}
	);
	return CreditNoteInvoiceItem;
};
