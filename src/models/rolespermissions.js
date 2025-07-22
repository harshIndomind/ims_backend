'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class RolesPermissions extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			RolesPermissions.belongsTo(models.Role, {
				foreignKey: 'roleId',
				as: 'role',
			});
			RolesPermissions.belongsTo(models.Permission, {
				foreignKey: 'permissionId',
				as: 'permission',
			});
		}
	}
	RolesPermissions.init(
		{
			roleId: DataTypes.INTEGER,
			permissionId: DataTypes.INTEGER,
		},
		{
			sequelize,
			modelName: 'RolesPermissions',
		}
	);
	return RolesPermissions;
};
