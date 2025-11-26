'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Payment extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			Payment.hasMany(models.PaymentInvoice, {
				foreignKey: 'payment_id',
				as: 'invoices',
			});

			Payment.belongsTo(models.BusinessPartner, {
				foreignKey: 'customer_id',
				onDelete: 'CASCADE',
				as: 'customer',
			});
		}
	}
	Payment.init(
		{
			orgId: {
				type: DataTypes.INTEGER,
				references: {
					model: 'organizations',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			customer_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'BusinessPartners',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			type: {
				type: DataTypes.ENUM(['INWARD', 'OUTWARD']),
			},
			receiptPrefix: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			receiptNumber: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			receiptPostfix: {
				type: DataTypes.STRING,
				allowNull: true,
			},

			totalOutstanding: {
				type: DataTypes.DECIMAL(12, 2),
			},
			paymentDate: {
				type: DataTypes.DATE,
				allowNull: false,
			},
			amount: {
				type: DataTypes.DECIMAL(12, 2),
			},
			advAmount: {
				type: DataTypes.DECIMAL(12, 2),
				allowNull: true,
			},
			paymentType: {
				type: DataTypes.ENUM([
					'CASH',
					'CHEQUE',
					'ONLINE',
					'BANK',
					'TDS',
					'BAD DEBTS / KASAR',
					'CURRENCY EXCHANGE LOSS',
				]),
			},
			is_payment_adv: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			remarks: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			transaction_id: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			credit_note_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: {
					model: 'CreditNoteInvoices',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			},
		},
		{
			sequelize,
			modelName: 'Payment',
		}
	);
	return Payment;
};
