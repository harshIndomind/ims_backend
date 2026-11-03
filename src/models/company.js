'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Company extends Model {
		static associate(models) {
			Company.hasMany(models.Project, {
				foreignKey: 'company_id',
				as: 'projects',
			});
		}
	}
	Company.init(
		{
			org_id: { type: DataTypes.INTEGER, allowNull: true },
			name: { type: DataTypes.STRING(255), allowNull: false },
			description: { type: DataTypes.TEXT, allowNull: true },
			address: { type: DataTypes.TEXT, allowNull: true },
			contact_no: { type: DataTypes.STRING(20), allowNull: true },
			alt_contact_no: { type: DataTypes.STRING(20), allowNull: true },
			is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
			created_by: { type: DataTypes.INTEGER, allowNull: true },
			updated_by: { type: DataTypes.INTEGER, allowNull: true },
		},
		{
			sequelize,
			timestamps: true,
			modelName: 'Company',
			tableName: 'companies',
		},
	);
	return Company;
};