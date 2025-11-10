'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class ProductSerial extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// define association here
		}
	}
	ProductSerial.init(
		{
			product_id: DataTypes.INTEGER,
			serial_no: {
				type: DataTypes.STRING,
				allowNull: false,
				unique: true
			},
			sell_price: {
				type: DataTypes.DECIMAL(12, 2),
				allowNull: true,
			},
			sell_price_incl_tax: {
				type: DataTypes.DECIMAL(12, 2),
				allowNull: true,
			},
			purchase_price: {
				type: DataTypes.DECIMAL(12, 2),
			},
			purchase_price_incl_tax: {
				type: DataTypes.DECIMAL(12, 2),
				allowNull: true,
			},
			is_sell: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
		},
		{
			sequelize,
			modelName: 'ProductSerial',
		}
	);
	return ProductSerial;
};
