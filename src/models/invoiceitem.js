'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class InvoiceItem extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			InvoiceItem.belongsTo(models.Invoice, {
				foreignKey: 'invoice_id',
				as: 'invoice',
			});
			InvoiceItem.belongsTo(models.Product, {
				foreignKey: 'product_id',
				as: 'product',
				onDelete: 'CASCADE',
			});
			InvoiceItem.belongsTo(models.Tax, {
				foreignKey: 'tax_id',
				as: 'tax',
				onDelete: 'CASCADE',
			});
			InvoiceItem.belongsTo(models.ProductBatch, {
				foreignKey: 'batch_id',
				as: 'batches',
				onDelete: 'CASCADE',
			});
			InvoiceItem.hasMany(models.InvoiceItemSerial, {
				foreignKey: 'invoice_item_id',
				as: 'serials',
				onDelete: 'CASCADE',
			});
			InvoiceItem.belongsTo(models.Unit, {
				foreignKey: 'selected_uom_id',
				as: 'selectedUom',
			});
			InvoiceItem.hasMany(models.ProductUOM, {
				foreignKey: 'product_id',
				sourceKey: 'product_id',
				as: 'uoms',
				constraints: false,
			});
		}
	}
	InvoiceItem.init(
		{
			invoice_id: DataTypes.INTEGER,
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
			modelName: 'InvoiceItem',
		}
	);
	return InvoiceItem;
};
