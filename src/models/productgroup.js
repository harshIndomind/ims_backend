'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class ProductGroup extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			ProductGroup.belongsTo(models.organization, {
				foreignKey: 'organization_id',
				as: 'organization',
			});

			ProductGroup.belongsToMany(models.Product, {
				through: 'product_product_group',
				foreignKey: 'product_group_id',
				otherKey: 'product_id',
				as:'products'
			});
		}
	}
	ProductGroup.init(
		{
			organization_id: DataTypes.INTEGER,
			name: DataTypes.STRING,
			description: DataTypes.TEXT,
			is_active: DataTypes.BOOLEAN,
		},
		{
			sequelize,
			modelName: 'ProductGroup',
		}
	);
	return ProductGroup;
};
