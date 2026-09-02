'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterAdditionalNotesTemplate extends Model {
		static associate(models) {
			MasterAdditionalNotesTemplate.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
		}
	}
	MasterAdditionalNotesTemplate.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'organizations', key: 'id' },
			},
			type: {
				type: DataTypes.ENUM('PO', 'WO', 'BOTH'),
				allowNull: false,
			},
			vendor_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			vendor_name: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			notes: {
				type: DataTypes.JSON,
				allowNull: false,
				defaultValue: [],
			},
			is_active: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: true,
			},
		},
		{
			sequelize,
			timestamps: true,
			modelName: 'MasterAdditionalNotesTemplate',
			tableName: 'MasterAdditionalNotesTemplates',
		},
	);
	return MasterAdditionalNotesTemplate;
};