'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class CreditNoteInvoiceItemSerial extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			CreditNoteInvoiceItemSerial.belongsTo(models.CreditNoteInvoiceItem, {
				foreignKey: 'credit_note_invoice_item_id',
				as: 'item',
				onDelete: 'CASCADE',
			});
			CreditNoteInvoiceItemSerial.belongsTo(models.ProductSerial, {
				foreignKey: 'serial_no',
				targetKey: 'serial_no',
				as: 'serial',
				onDelete: 'CASCADE',
			});
		}
	}
	CreditNoteInvoiceItemSerial.init(
		{
			credit_note_invoice_item_id: DataTypes.INTEGER,
			serial_no: { type: DataTypes.STRING, unique: true },
		},
		{
			sequelize,
			modelName: 'CreditNoteInvoiceItemSerial',
		}
	);
	return CreditNoteInvoiceItemSerial;
};
