'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
	class UserVisibilityMapping extends Model {
		static associate(models) {
			UserVisibilityMapping.belongsTo(models.User, {
				foreignKey: 'user_id',
				as: 'user',
			});
			UserVisibilityMapping.belongsTo(models.MasterUnit, {
				foreignKey: 'unit_id',
				as: 'unit',
			});
			UserVisibilityMapping.belongsTo(models.Department, {
				foreignKey: 'department_id',
				as: 'department',
			});
		}
	}

	UserVisibilityMapping.init(
		{
			user_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			unit_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			department_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			created_by: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'UserVisibilityMapping',
		},
	);

	return UserVisibilityMapping;
};
