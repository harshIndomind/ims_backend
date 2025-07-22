'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class RoleMenus extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// define association here
		}
	}
	RoleMenus.init(
		{
			roleId: {
				type: DataTypes.INTEGER,
				allowNull: false,
				primaryKey: true,
			},
			menuId: {
				type: DataTypes.INTEGER,
				allowNull: false,
				primaryKey: true,
			},
		},
		{
			sequelize,
			modelName: 'RoleMenus',
		},
		{
			tableName: 'RoleMenus',
			timestamps: false,
			// ✅ Tell Sequelize NOT to automatically add an id
			createdAt: false,
			updatedAt: false,
			// ✅ Critical
			// Prevent Sequelize from adding the 'id' field
			// This is the key!
			hasPrimaryKeys: true,
			omitNull: false,
			// ⛔️ This line ensures no 'id' is added automatically
			// This must be added:
			id: false,
		}
	);

	RoleMenus.associate = function (models) {
		// optionally, if you want to reference Role and Menu models:
		RoleMenus.belongsTo(models.Role, { foreignKey: 'roleId' });
		RoleMenus.belongsTo(models.Menu, { foreignKey: 'menuId' });
	};
	return RoleMenus;
};
