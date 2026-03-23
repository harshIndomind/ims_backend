'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class SubDepartment extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			SubDepartment.belongsTo(models.Department, {
				foreignKey: 'department_id',
				as: 'department',
			});
		}
	}
	SubDepartment.init(
		{
			department_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			name: {
				type: DataTypes.STRING(100),
				allowNull: false,
				unique: true,
			},
			description: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			is_active: {
				type: DataTypes.BOOLEAN,
				defaultValue: true,
			},
			createdAt: {
				allowNull: false,
				type: DataTypes.DATE,
			},
			updatedAt: {
				allowNull: false,
				type: DataTypes.DATE,
			},
		},
		{
			sequelize,
			tableName: 'sub_departments',
			modelName: 'SubDepartment',
		},
	);
	return SubDepartment;
};
