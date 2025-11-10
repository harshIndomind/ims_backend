'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class ProductBatch extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// define association here
		}
	}
	ProductBatch.init(
		{
			product_id: DataTypes.INTEGER,
			batch_no: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			qty: {
				type: DataTypes.DECIMAL(12, 2),
				allowNull: true,
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
			barcode_no: {
				type: DataTypes.STRING,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'ProductBatch',
		}
	);
	return ProductBatch;
};
