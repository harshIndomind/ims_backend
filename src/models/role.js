'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Role extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			Role.hasMany(models.User, { foreignKey: 'roleId' });

			// // Many-to-many with Permissions
			// Role.belongsToMany(models.Permission, {
			// 	through: 'RolesPermissions',
			// 	foreignKey: 'roleId',
			// 	otherKey: 'permissionId',
			// 	as: 'permissions',
			// 	onDelete: 'CASCADE',
			// });

			// Role.belongsToMany(models.Menu, {
			// 	through: 'RoleMenus',
			// 	as: 'menus',
			// 	foreignKey: 'roleId',
			// 	otherKey: 'menuId',
			// });

			Role.belongsToMany(models.User, {
				through: models.UserRole,
				foreignKey: 'role_id',
			});

			Role.belongsToMany(models.Permission, {
				through: models.RolePermission,
				foreignKey: 'role_id',
			});
		}
	}
	Role.init(
		{
			name: {
				type: DataTypes.STRING,
				allowNull: false,
				unique: true,
			},
			code: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			description: {
				type: DataTypes.STRING,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'Role',
		},
	);
	return Role;
};
