'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Project extends Model {
		static associate(models) {
			Project.belongsTo(models.Company, {
				foreignKey: 'company_id',
				as: 'company',
			});
		}
	}
	Project.init(
		{
			org_id: { type: DataTypes.INTEGER, allowNull: true },
			company_id: { type: DataTypes.INTEGER, allowNull: false },
			name: { type: DataTypes.STRING(255), allowNull: false },
			description: { type: DataTypes.TEXT, allowNull: true },
			status: {
				type: DataTypes.ENUM('not_started', 'in_progress', 'completed'),
				allowNull: false,
				defaultValue: 'not_started',
			},
			start_date: { type: DataTypes.DATEONLY, allowNull: false },
			end_date: { type: DataTypes.DATEONLY, allowNull: true },
			is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
			created_by: { type: DataTypes.INTEGER, allowNull: true },
			updated_by: { type: DataTypes.INTEGER, allowNull: true },
		},
		{
			sequelize,
			timestamps: true,
			modelName: 'Project',
			tableName: 'projects',
		},
	);
	return Project;
};