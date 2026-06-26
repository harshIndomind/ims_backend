'use strict';

module.exports = (sequelize, DataTypes) => {
  const Designation = sequelize.define(
    'Designation',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      uuid: {
        type: DataTypes.CHAR(36),
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        unique: true,
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
      department_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      title: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      desCd: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      desName: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      lock: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
    },
    {
      tableName: 'designations',
    }
  );

  Designation.associate = (models) => {
    Designation.belongsTo(models.Department, {
      foreignKey: 'department_id',
      as: 'department',
    });
  };

  return Designation;
};
