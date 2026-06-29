'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class MasterPlaceOfUse extends Model {
        static associate(models) {
            MasterPlaceOfUse.belongsTo(models.organization, {
                foreignKey: 'org_id',
                as: 'organization',
            });
        }
    }

    MasterPlaceOfUse.init(
        {
            org_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            code: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            short_name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            created_by: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            updated_by: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
        },
        {
            sequelize,
            modelName: 'MasterPlaceOfUse',
            tableName: 'MasterPlaceOfUses',
            timestamps: true,
        },
    );

    return MasterPlaceOfUse;
};