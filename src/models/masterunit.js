'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterUnit extends Model {
		static associate(models) {
			MasterUnit.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			MasterUnit.hasMany(models.Budget, {
				foreignKey: 'unit_id',
				as: 'budgets',
			});
			MasterUnit.hasMany(models.Indent, {
				foreignKey: 'unit_id',
				as: 'indents',
			});
			MasterUnit.belongsTo(models.Country, {
				foreignKey: 'country_id',
				as: 'countryData',
			});
			MasterUnit.belongsTo(models.GstStateCode, {
				foreignKey: 'state_id',
				as: 'stateData',
			});
		}
	}
	MasterUnit.init(
		{
			uuid: {
				type: DataTypes.CHAR(36),
				defaultValue: DataTypes.UUIDV4,
				allowNull: false,
				unique: true,
			},
			org_id: DataTypes.INTEGER,

			// Local editable fields
			unit_name: DataTypes.STRING,
			unit_short_name: DataTypes.STRING,

			// HRMS-synced fields (read-only via API)
			unitCd: {
				type: DataTypes.INTEGER,
				allowNull: true,
				defaultValue: 0,
			},
			unitName: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			lock: {
				type: DataTypes.BOOLEAN,
				allowNull: true,
				defaultValue: false,
			},
			masterUnitid: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},

			// Company details
			gstin: {
				type: DataTypes.STRING(30),
				allowNull: true,
			},
			pan: {
				type: DataTypes.STRING(20),
				allowNull: true,
			},
			registration_type: {
				type: DataTypes.TINYINT,
				allowNull: true,
				defaultValue: 1,
			},
			contact_no: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			company_email: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			is_tds_applicable: {
				type: DataTypes.BOOLEAN,
				allowNull: true,
				defaultValue: false,
			},
			tds_percentage: {
				type: DataTypes.DECIMAL(10, 2),
				allowNull: true,
				defaultValue: 0,
			},

			// Billing address
			address1: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			address2: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			landmark: {
				type: DataTypes.STRING(150),
				allowNull: true,
			},
			country_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			state_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			country: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			state: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			city: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			pincode: {
				type: DataTypes.STRING(10),
				allowNull: true,
			},

			// Bank details
			bank_account_holder_name: {
				type: DataTypes.STRING(150),
				allowNull: true,
			},
			bank_name: {
				type: DataTypes.STRING(150),
				allowNull: true,
			},
			bank_ifsc_code: {
				type: DataTypes.STRING(20),
				allowNull: true,
			},
			bank_account_no: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			bank_branch_name: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},

			// Additional details
			fax: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			website: {
				type: DataTypes.STRING(150),
				allowNull: true,
			},
			credit_limit: {
				type: DataTypes.DECIMAL(10, 2),
				allowNull: true,
			},
			due_days: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			note: {
				type: DataTypes.TEXT,
				allowNull: true,
			},

			// Opening balance
			ob_vendor_balance_type: {
				type: DataTypes.ENUM('credit', 'debit'),
				allowNull: true,
				defaultValue: 'credit',
			},
			ob_vendor_amount: {
				type: DataTypes.DECIMAL(10, 2),
				allowNull: true,
				defaultValue: 0,
			},
			ob_customer_balance_type: {
				type: DataTypes.ENUM('credit', 'debit'),
				allowNull: true,
				defaultValue: 'credit',
			},
			ob_customer_amount: {
				type: DataTypes.DECIMAL(10, 2),
				allowNull: true,
				defaultValue: 0,
			},
		},
		{
			sequelize,
			modelName: 'MasterUnit',
		},
	);
	return MasterUnit;
};
