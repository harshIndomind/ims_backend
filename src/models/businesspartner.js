'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class BusinessPartner extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			BusinessPartner.belongsTo(models.organization, {
				foreignKey: 'organization_id',
				as: 'organization',
			});
			BusinessPartner.belongsTo(models.User, {
				foreignKey: 'user_id',
				as: 'user',
			});
			BusinessPartner.hasMany(models.Address, {
				foreignKey: 'partner_id',
				as: 'addresses',
			});
			BusinessPartner.hasOne(models.BankDetail, {
				foreignKey: 'partner_id',
				as: 'bankDetails',
			});
			BusinessPartner.hasOne(models.AdditionalDetail, {
				foreignKey: 'partner_id',
				as: 'additionalDetails',
			});
			BusinessPartner.hasMany(models.OpeningBalance, {
				foreignKey: 'partner_id',
				as: 'openingBalances',
			});
			BusinessPartner.belongsTo(models.RegistrationType, {
				foreignKey: 'registration_type_id',
				as: 'registrationType',
			});
		}
	}
	BusinessPartner.init(
		{
			organization_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			user_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			type: {
				type: DataTypes.ENUM('vendor', 'customer', 'vendor_customer'),
				allowNull: false,
			},
			name: {
				type: DataTypes.STRING(150),
				allowNull: false,
			},
			code: {
				type: DataTypes.STRING(50),
				allowNull: false,
				unique: true,
			},
			account_code: {
				type: DataTypes.STRING(50),
				allowNull: true,
				unique: true,
			},
			contact_no: DataTypes.STRING(20),
			email: DataTypes.TEXT,
			gstin: DataTypes.STRING(30),
			pan: DataTypes.STRING(20),
			registration_type: {
				type: DataTypes.TINYINT,
				defaultValue: 1, // 1 = Registered, 2 = Unregistered
			},
			is_active: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			registration_type_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'RegistrationTypes',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'RESTRICT',
			},
			openSwayammOthersAccount: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			isApplicableForTds: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			tds_percentage: {
				type: DataTypes.DECIMAL(10, 2),
				defaultValue: 0,
			},
			created_by: DataTypes.INTEGER,
		},
		{
			sequelize,
			modelName: 'BusinessPartner',
		}
	);
	return BusinessPartner;
};
