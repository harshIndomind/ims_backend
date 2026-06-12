'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
	class MasterTermCategory extends Model {
		static associate(models) {
			// add associations here if needed later
		}
	}

	MasterTermCategory.init(
    {
        category_name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        category_code: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'MasterTermCategory',
        tableName: 'MasterTermCategories',
    }
);

	return MasterTermCategory;
};