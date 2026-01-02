'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterMajorHeadAmount extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			MasterMajorHeadAmount.belongsTo(models.MasterMajorHead, {
				foreignKey: 'major_head_id',
				as: 'majorHead'
			})
			MasterMajorHeadAmount.belongsTo(models.MasterPeriod, {
				foreignKey: 'period_id',
				as: 'period'
			})
			MasterMajorHeadAmount.hasMany(models.MasterSubHeadAmount, {
				foreignKey: 'major_head_amount_id',
				as: 'subHeadAmount'
			})
			MasterMajorHeadAmount.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
		}
	}
	MasterMajorHeadAmount.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'organization', key: 'id' },
			},
			major_head_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'MasterMajorHead',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
				allowNull: false,
			},
			period_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'MasterPeriod',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
				allowNull: false,
			},
			amount: {
				type: DataTypes.DECIMAL(12, 2),
				allowNull: false,
			},
		},
		{
			sequelize,
			modelName: 'MasterMajorHeadAmount',
		}
	);
	return MasterMajorHeadAmount;
};
