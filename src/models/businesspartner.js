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
		}
	}
	BusinessPartner.init(
		{
			organization_id: {
				type: DataTypes.BIGINT,
				allowNull: false,
			},
			user_id: {
				type: DataTypes.BIGINT,
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
			created_by: DataTypes.BIGINT,
		},
		{
			sequelize,
			modelName: 'BusinessPartner',
		}
	);
	return BusinessPartner;
};
