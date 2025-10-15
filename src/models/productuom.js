'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class ProductUOM extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			ProductUOM.belongsTo(models.Product, {
				foreignKey: 'product_id',
				as: 'product',
			});

			ProductUOM.belongsTo(models.Unit, {
				foreignKey: 'unit_id',
				as: 'unit',
			});
		}
	}
	ProductUOM.init(
		{
			product_id: {
				type: DataTypes.BIGINT,
				allowNull: false,
			},
			unit_id: {
				type: DataTypes.BIGINT,
				allowNull: false,
			},
			qty: {
				type: DataTypes.DECIMAL(12, 2),
				allowNull: false,
			},
		},
		{
			sequelize,
			modelName: 'ProductUOM',
		}
	);
	return ProductUOM;
};
