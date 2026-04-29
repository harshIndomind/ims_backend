'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterTransporter extends Model {
		static associate(models) {
			MasterTransporter.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
		}
	}
	MasterTransporter.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'organizations', key: 'id' },
			},
			name: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			address1: {
				type: DataTypes.TEXT,
				allowNull: false,
			},
			address2: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			contactNo: {
				type: DataTypes.STRING,
				allowNull: true,
			},
		},
		{
			sequelize,
			timestamps: true,
			modelName: 'MasterTransporter',
		},
	);
	return MasterTransporter;
};
