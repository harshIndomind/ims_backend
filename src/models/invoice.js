'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Invoice extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			Invoice.belongsTo(
				models.organization,
				{ foreignKey: 'orgId', as: 'organization' },
				{ onDelete: 'CASCADE' }
			);
			Invoice.belongsTo(
				models.BusinessPartner,
				{ foreignKey: 'customerId', as: 'partner' },
				{ onDelete: 'CASCADE' }
			);
			Invoice.hasMany(
				models.InvoiceItem,
				{ foreignKey: 'invoice_id', as: 'productItems' },
				{ onDelete: 'CASCADE' }
			);
			Invoice.hasOne(
				models.OrganizationBankDetails,
				{ foreignKey: 'id', sourceKey: 'bank_id', as: 'bankDetails' },
				{ onDelete: 'CASCADE' }
			);
		}
	}
	Invoice.init(
		{
			orgId: { type: DataTypes.INTEGER, allowNull: true },
			customerId: { type: DataTypes.INTEGER, allowNull: true },
			bank_id: { type: DataTypes.INTEGER, allowNull: true },
			invoicePrefix: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			invoiceNo: {
				type: DataTypes.STRING,
				unique: true,
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
		},
		{
			sequelize,
			modelName: 'Invoice',
		}
	);
	return Invoice;
};
