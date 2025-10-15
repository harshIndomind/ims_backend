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
		}
	}
	Address.init(
		{
			partner_id: DataTypes.BIGINT,
			type: DataTypes.ENUM('billing', 'shipping'),
			address1: DataTypes.TEXT,
			address2: DataTypes.TEXT,
			landmark: DataTypes.STRING(150),
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
