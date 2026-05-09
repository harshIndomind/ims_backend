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
			org_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'organizations',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			name: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			description: {
				type: DataTypes.TEXT,
			},
			is_active: {
				type: DataTypes.BOOLEAN,
				defaultValue: true,
			},
			depCd: {
				type: DataTypes.STRING(20),
				allowNull: true,
			},
			depName: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			unitCd: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			unit_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
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
		Department.belongsTo(models.MasterUnit, {
			foreignKey: 'unit_id',
			as: 'unit',
		});
	};

	return Department;
};
