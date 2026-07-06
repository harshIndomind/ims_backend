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
			// Permission.belongsTo(models.Menu, {
			// 	foreignKey: 'menuId',
			// 	as: 'menu',
			// 	onDelete: 'CASCADE',
			// });

			// Permission.belongsToMany(models.Role, {
			// 	through: 'RolesPermissions',
			// 	foreignKey: 'permissionId',
			// 	otherKey: 'roleId',
			// 	as: 'roles',
			// 	onDelete: 'CASCADE',
			// });

			Permission.belongsTo(models.Menu, {
				foreignKey: 'menu_id',
				as: 'menu',
			});

			Permission.belongsToMany(models.Role, {
				through: models.RolePermission,
				foreignKey: 'permission_id',
			});
		}
	}
	Permission.init(
		{
			id: {
				type: DataTypes.INTEGER,
				autoIncrement: true,
				primaryKey: true,
			},
			menu_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			action: {
				type: DataTypes.STRING,
			},
		},
		{
			sequelize,
			modelName: 'Permission',
			tableName: 'Permissions',
		},
	);
	return Permission;
};
