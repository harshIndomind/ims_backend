'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterSubHeadCostCenterAmount extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			MasterSubHeadCostCenterAmount.belongsTo(models.MasterSubHeadAmount, {
				foreignKey: 'sub_head_amount_id',
				as: 'subHeadAmount',
			});
			MasterSubHeadCostCenterAmount.belongsTo(models.MasterMajorHead, {
				foreignKey: 'major_head_id',
				as: 'majorHead',
			});
			MasterSubHeadCostCenterAmount.belongsTo(models.MasterSubHead, {
				foreignKey: 'sub_head_id',
				as: 'subHead',
			});
			MasterSubHeadCostCenterAmount.belongsTo(models.MasterPeriod, {
				foreignKey: 'period_id',
				as: 'period',
			});
			MasterSubHeadCostCenterAmount.belongsTo(models.CostCenter, {
				foreignKey: 'cost_center_id',
				as: 'cost_center',
			});
			MasterSubHeadCostCenterAmount.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			MasterSubHeadCostCenterAmount.hasMany(models.Budget, {
				foreignKey: 'sub_head_cost_center_amount_id',
				as: 'budgets',
			});
		}
	}
	MasterSubHeadCostCenterAmount.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'organization', key: 'id' },
			},
			sub_head_amount_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'MasterSubHeadAmount',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
				allowNull: false,
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
			sub_head_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'MasterSubHead',
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
			cost_center_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'CostCenter',
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
			modelName: 'MasterSubHeadCostCenterAmount',
		}
	);
	return MasterSubHeadCostCenterAmount;
};
