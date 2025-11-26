'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class CreditNoteInvoice extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			CreditNoteInvoice.belongsTo(
				models.Invoice,
				{ foreignKey: 'invoice_id', as: 'invoice' },
				{ onDelete: 'CASCADE' }
			);
			CreditNoteInvoice.belongsTo(
				models.organization,
				{ foreignKey: 'orgId', as: 'organization' },
				{ onDelete: 'CASCADE' }
			);
			CreditNoteInvoice.belongsTo(
				models.BusinessPartner,
				{ foreignKey: 'customerId', as: 'partner' },
				{ onDelete: 'CASCADE' }
			);
			CreditNoteInvoice.hasMany(
				models.CreditNoteInvoiceItem,
				{ foreignKey: 'credit_note_invoice_id', as: 'productItems' },
				{ onDelete: 'CASCADE' }
			);
			CreditNoteInvoice.hasOne(
				models.OrganizationBankDetails,
				{ foreignKey: 'id', sourceKey: 'bank_id', as: 'bankDetails' },
				{ onDelete: 'CASCADE' }
			);
			// CreditNoteInvoice.hasMany(models.PaymentInvoice, {foreignKey: 'invoice_id', as: 'payments'});
			CreditNoteInvoice.hasMany(models.Payment, {foreignKey: 'credit_note_id', as: 'payments'});
		}
	}
	CreditNoteInvoice.init(
		{
			invoice_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'Invoices',
					key: 'id',
				},
				allowNull: true,
			},
			orgId: { type: DataTypes.INTEGER, allowNull: true },
			customerId: { type: DataTypes.INTEGER, allowNull: true },
			bank_id: { type: DataTypes.INTEGER, allowNull: true },
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
			dueDate: { type: DataTypes.DATE, allowNull: true },
			total_taxable: DataTypes.DECIMAL(15, 2),
			total_tax: DataTypes.DECIMAL(15, 2),
			isRoundOff: { type: DataTypes.BOOLEAN, defaultValue: false },
			grandTotal: DataTypes.DECIMAL(15, 2),
			totalPaid: DataTypes.DECIMAL(15, 2),
			remainingAmount: DataTypes.DECIMAL(15, 2),
			paymentType: DataTypes.JSON,
			customerInfo: DataTypes.JSON,
			invoiceDetail: DataTypes.JSON,
			additionalNotes: DataTypes.JSON,
			customFields: DataTypes.JSON,
			remarks: { type: DataTypes.TEXT, allowNull: true },
			same_state: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			status: {
				type: DataTypes.ENUM(['pending', 'completed']),
				defaultValue: 'pending',
			},
			paymentStatus: {
				type: DataTypes.STRING,
				defaultValue: 'PENDING',
			},
		},
		{
			sequelize,
			modelName: 'CreditNoteInvoice',
		}
	);
	return CreditNoteInvoice;
};
