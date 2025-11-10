'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class InvoiceCsvImport extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			InvoiceCsvImport.hasMany(models.InvoiceCsvImportItem, {
				foreignKey: 'invoice_csv_import_id',
				as: 'csv_items',
			});
		}
	}
	InvoiceCsvImport.init(
		{
			voucher_type: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			uploaded_file_name: { type: DataTypes.TEXT, allowNull: true },
			organization_code: { type: DataTypes.STRING, allowNull: true },
			vendor_code: { type: DataTypes.STRING, allowNull: true },
			company_name: { type: DataTypes.STRING, allowNull: true },
			invoice_no: { type: DataTypes.STRING, allowNull: true },
			invoice_date: { type: DataTypes.DATE, allowNull: true },
			ack_no: { type: DataTypes.STRING, allowNull: true },
			ack_date: { type: DataTypes.DATE, allowNull: true },
			due_date: { type: DataTypes.DATE, allowNull: true },
			cgst: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			sgst: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			total_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
			seller_contact_no: { type: DataTypes.STRING, allowNull: true },
			seller_email_address: { type: DataTypes.STRING, allowNull: true },
			seller_cin: { type: DataTypes.STRING, allowNull: true },
			seller_gstin: { type: DataTypes.STRING, allowNull: true },
			seller_pan: { type: DataTypes.STRING, allowNull: true },
			account_holder_name: { type: DataTypes.STRING, allowNull: true },
			seller_bank_name: { type: DataTypes.STRING, allowNull: true },
			seller_account_no: { type: DataTypes.STRING, allowNull: true },
			seller_ifsc_code: { type: DataTypes.STRING, allowNull: true },
			seller_address: { type: DataTypes.STRING, allowNull: true },
			seller_state: { type: DataTypes.STRING, allowNull: true },
			seller_district: { type: DataTypes.STRING, allowNull: true },
			seller_pin_code: { type: DataTypes.STRING, allowNull: true },
			place_of_supply: { type: DataTypes.STRING, allowNull: true },
			bill_to_ship_To: { type: DataTypes.STRING, allowNull: true },
			buyer_email_address: { type: DataTypes.STRING, allowNull: true },
			buyer_gstin: { type: DataTypes.STRING, allowNull: true },
			buyer_contact_no: { type: DataTypes.STRING, allowNull: true },
			billing_buyer_address: { type: DataTypes.STRING, allowNull: true },
			buyer_state: { type: DataTypes.STRING, allowNull: true },
			buyer_district: { type: DataTypes.STRING, allowNull: true },
			buyer_pin_code: { type: DataTypes.STRING, allowNull: true },
			status: {
				type: DataTypes.ENUM(['DUPLICATE', 'FAILED', 'RESULT']),
				allowNull: true,
				defaultValue: 'RESULT',
			},
			porting_status: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
		},
		{
			sequelize,
			modelName: 'InvoiceCsvImport',
		}
	);
	return InvoiceCsvImport;
};
