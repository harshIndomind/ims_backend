'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Permission extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			Permission.belongsTo(models.Menu, {
				foreignKey: 'menuId',
				as: 'menu',
				onDelete: 'CASCADE',
			});

			Permission.belongsToMany(models.Role, {
				through: 'RolesPermissions',
				foreignKey: 'permissionId',
				otherKey: 'roleId',
				as: 'roles',
				onDelete: 'CASCADE',
			});
		}
	}
	Permission.init(
		{
			menuId: {
				type: DataTypes.STRING,
				references: {
					model: 'Menus',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			permission: DataTypes.STRING,
		},
		{
			sequelize,
			modelName: 'Permission',
		}
	);
	return Permission;
};
