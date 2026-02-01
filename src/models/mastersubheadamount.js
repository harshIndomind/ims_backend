'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterSubHeadAmount extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			MasterSubHeadAmount.belongsTo(models.MasterMajorHeadAmount, {
				foreignKey: 'major_head_amount_id',
				as: 'majorHeadAmount'
			})
			MasterSubHeadAmount.belongsTo(models.MasterMajorHead, {
				foreignKey: 'major_head_id',
				as: 'majorHead'
			})
			MasterSubHeadAmount.belongsTo(models.MasterSubHead, {
				foreignKey: 'sub_head_id',
				as: 'subHead'
			})
			MasterSubHeadAmount.belongsTo(models.MasterPeriod, {
				foreignKey: 'period_id',
				as: 'period'
			})
			MasterSubHeadAmount.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			MasterSubHeadAmount.hasMany(models.Budget, {
				foreignKey: 'sub_head_amount_id',
				as: 'budgets',
			});
		}
	}
	MasterSubHeadAmount.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'organization', key: 'id' },
			},
			major_head_amount_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			major_head_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			sub_head_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			period_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			amount: {
				type: DataTypes.DECIMAL(12, 2),
				allowNull: false,
			},
		},
		{
			sequelize,
			modelName: 'MasterSubHeadAmount',
		}
	);
	return MasterSubHeadAmount;
};
