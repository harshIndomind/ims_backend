'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Address extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			Address.belongsTo(models.BusinessPartner, { foreignKey: 'partner_id' });
			Address.belongsTo(models.Country, {
				foreignKey: 'country_id',
				as: 'countryData',
			});

			Address.belongsTo(models.GstStateCode, {
				foreignKey: 'state_id',
				as: 'stateData',
			});
		}
	}
	Address.init(
		{
			partner_id: DataTypes.INTEGER,
			type: DataTypes.ENUM('billing', 'shipping'),
			gstin: DataTypes.STRING(15),
			name: { type: DataTypes.STRING(150), allowNull: true },
			contact_person: { type: DataTypes.STRING(150), allowNull: true },
			phone: { type: DataTypes.STRING, allowNull: true },
			email: { type: DataTypes.STRING, allowNull: true },
			distance_km: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
			address1: DataTypes.TEXT,
			address2: { type: DataTypes.TEXT, allowNull: true },
			landmark: DataTypes.STRING(150),
			country_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'Countries',
					key: 'id',
				},
			},
			state_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'GstStateCodes',
					key: 'id',
				},
			},
			country: DataTypes.STRING(100),
			state: DataTypes.STRING(100),
			city: DataTypes.STRING(100),
			pincode: DataTypes.STRING(10),
		},
		{
			sequelize,
			modelName: 'Address',
		}
	);
	return Address;
};
