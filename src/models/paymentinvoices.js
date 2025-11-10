'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class PaymentInvoice extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			PaymentInvoice.belongsTo(models.Payment, { foreignKey: 'payment_id', as: 'receipt' });
			PaymentInvoice.belongsTo(models.Invoice, { foreignKey: 'invoice_id', as: 'invoice' });
		}
	}
	PaymentInvoice.init(
		{
			payment_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'Payments',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			invoice_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'Invoices',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			amount_adjusted: {
				type: DataTypes.DECIMAL(12, 2),
			},
			remaining_amount: {
				type: DataTypes.DECIMAL(12, 2),
			},
			selected: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
		},
		{
			sequelize,
			modelName: 'PaymentInvoice',
		}
	);
	return PaymentInvoice;
};
