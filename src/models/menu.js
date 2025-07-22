'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Menu extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// Nested menus
			Menu.hasMany(models.Menu, {
				foreignKey: 'parentId',
				as: 'children',
				onDelete: 'CASCADE',
			});

			Menu.belongsTo(models.Menu, {
				foreignKey: 'parentId',
				as: 'parent',
			});

			Menu.hasMany(models.Permission, {
				foreignKey: 'menuId',
				as: 'permissions',
				onDelete: 'CASCADE',
			});

			Menu.belongsToMany(models.Role, {
				through: 'RoleMenus',
				as: 'roles',
				foreignKey: 'menuId',
				otherKey: 'roleId',
			});
		}
	}
	Menu.init(
		{
			parentId: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: {
					model: 'Menus',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			menuName: { type: DataTypes.STRING, allowNull: false },
			icon: { type: DataTypes.STRING, allowNull: true },
			url: DataTypes.STRING,
			isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
		},
		{
			sequelize,
			modelName: 'Menu',
		}
	);
	return Menu;
};
