'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterPeriod extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// MasterPeriod.belongsTo(models.MasterMajorHead, {
			// 	foreignKey: 'major_code_id',
			// 	as: 'majorHead'
			// })
			MasterPeriod.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
		}
	}
	MasterPeriod.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'organization', key: 'id' },
			},
			from_date: {
				type: DataTypes.DATEONLY,
				allowNull: true,
			},
			end_date: {
				type: DataTypes.DATEONLY,
				allowNull: true,
			},
			period_code: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			period: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			period_detail: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			period_short: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			is_lock: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
		},
		{
			sequelize,
			paranoid: true,
			timestamps: true,
			modelName: 'MasterPeriod',
		},
	);
	return MasterPeriod;
};
