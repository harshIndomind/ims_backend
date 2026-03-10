'use strict';

module.exports = (sequelize, DataTypes) => {
	const Department = sequelize.define(
		'Department',
		{
			id: {
				type: DataTypes.INTEGER,
				primaryKey: true,
				autoIncrement: true,
			},
			name: {
				type: DataTypes.STRING(100),
				allowNull: false,
				unique: true,
			},
			description: {
				type: DataTypes.TEXT,
			},
			is_active: {
				type: DataTypes.BOOLEAN,
				defaultValue: true,
			},
		},
		{
			tableName: 'departments',
		},
	);

	Department.associate = (models) => {
		Department.hasMany(models.Designation, {
			foreignKey: 'department_id',
			as: 'designations',
		});
		Department.hasMany(models.SubDepartment, {
			foreignKey: 'department_id',
			as: 'sub_departments',
		});
	};

	return Department;
};
