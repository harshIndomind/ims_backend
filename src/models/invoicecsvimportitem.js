'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class InvoiceCsvImportItem extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			InvoiceCsvImportItem.belongsTo(models.InvoiceCsvImport, {
				foreignKey: 'invoice_csv_import_id',
				as: 'invoice_csv',
			});
		}
	}
	InvoiceCsvImportItem.init(
		{
			invoice_csv_import_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'InvoiceCsvImports',
					key: 'id',
				},
			},
			item_code: { type: DataTypes.STRING, allowNull: true },
			item_name: { type: DataTypes.STRING, allowNull: true },
			description_of_item: { type: DataTypes.TEXT, allowNull: true },
			hsn_sac: { type: DataTypes.STRING, allowNull: true },
			quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			price_unit: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			sub_total: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			item_discount_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			item_discount_percentage: {
				type: DataTypes.DECIMAL(12, 2),
				allowNull: true,
			},
			item_net_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			item_cgst_percentage: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			item_cgst_value: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			item_sgst_percentage: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			item_sgst_value: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			item_igst_percentage: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			item_igst_value: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			item_tax_percentage: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			item_net_total: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
		},
		{
			sequelize,
			modelName: 'InvoiceCsvImportItem',
		}
	);
	return InvoiceCsvImportItem;
};
