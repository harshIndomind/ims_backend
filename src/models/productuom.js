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
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
			});

			// Each ProductUOM belongs to a Unit
			ProductUOM.belongsTo(models.Unit, {
				foreignKey: 'unit_id',
				as: 'unit',
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
			});
		}
	}
	ProductUOM.init(
		{
			product_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			unit_id: {
				type: DataTypes.INTEGER,
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
