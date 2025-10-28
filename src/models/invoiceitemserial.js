'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class InvoiceItemSerial extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			InvoiceItemSerial.belongsTo(models.InvoiceItem, {
				foreignKey: 'invoice_item_id',
				as: 'item',
				onDelete: 'CASCADE',
			});
			InvoiceItemSerial.belongsTo(models.ProductSerial, {
				foreignKey: 'serial_no',
				as: 'serial',
				onDelete: 'CASCADE',
			});
		}
	}
	InvoiceItemSerial.init(
		{
			invoice_item_id: DataTypes.INTEGER,
			serial_no: DataTypes.STRING(100),
		},
		{
			sequelize,
			modelName: 'InvoiceItemSerial',
		}
	);
	return InvoiceItemSerial;
};
