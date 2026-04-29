'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterTermsCondition extends Model {
		static associate(models) {
			MasterTermsCondition.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
		}
	}
	MasterTermsCondition.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'organizations', key: 'id' },
			},
			terms_type: {
				type: DataTypes.TEXT,
				allowNull: false,
			},
		},
		{
			sequelize,
			timestamps: true,
			modelName: 'MasterTermsCondition',
		},
	);
	return MasterTermsCondition;
};
