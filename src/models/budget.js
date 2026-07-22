'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Budget extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			Budget.belongsTo(models.MasterMajorHead, {
				foreignKey: 'major_head_id',
				as: 'majorHead',
			});
			Budget.belongsTo(models.MasterSubHead, {
				foreignKey: 'sub_head_id',
				as: 'subHead',
			});
			Budget.belongsTo(models.MasterPeriod, {
				foreignKey: 'period_id',
				as: 'period',
			});
			Budget.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			Budget.belongsTo(models.MasterMajorHeadAmount, {
				foreignKey: 'major_head_amount_id',
				as: 'majorHeadAmount',
			});
			Budget.belongsTo(models.MasterSubHeadAmount, {
				foreignKey: 'sub_head_amount_id',
				as: 'subHeadAmount',
			});
			Budget.belongsTo(models.CostCenter, {
				foreignKey: 'cost_center_id',
				as: 'cost_center',
			});
			Budget.belongsTo(models.Department, {
				foreignKey: 'department_id',
				as: 'department',
			});
			Budget.belongsTo(models.MasterUnit, {
				foreignKey: 'unit_id',
				as: 'unit',
			});
			Budget.belongsTo(models.User, {
				foreignKey: 'approved_by',
				as: 'approver',
			});
			Budget.hasMany(models.IndentItem, {
				foreignKey: 'budget_id',
				as: 'indentItems',
			});
		}
	}
	Budget.init(
		{
			budgetType: {
				type: DataTypes.ENUM('item-wise', 'value-wise'),
			},
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			budget_id: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			indent: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			unit_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			department_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			date: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			period_id: {
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
			major_head_amount_id: {
				type: DataTypes.INTEGER,
			},
			sub_head_amount_id: {
				type: DataTypes.INTEGER,
			},
			budget_head_id: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			cost_center_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			product_id: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			product_group_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			stncode: {
				type: DataTypes.STRING(20),
				allowNull: true,
			},
			stnname: {
				type: DataTypes.STRING(255),
				allowNull: true,
			},
			iuom: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			qty_for_purchase: {
				type: DataTypes.DOUBLE,
				allowNull: true,
			},
			amount: {
				type: DataTypes.DOUBLE,
				allowNull: true,
			},
			average_rate: {
				type: DataTypes.DOUBLE,
				allowNull: true,
			},
			first_phase_qty: {
				type: DataTypes.DOUBLE,
				allowNull: true,
			},
			first_phase_date: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			second_phase_qty: {
				type: DataTypes.DOUBLE,
				allowNull: true,
			},
			second_phase_date: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			third_phase_qty: {
				type: DataTypes.DOUBLE,
				allowNull: true,
			},
			third_phase_date: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			sanc_by: {
				type: DataTypes.ENUM('yes', 'no'),
				allowNull: true,
				defaultValue: 'no',
			},
			approved_by: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			approved_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			category: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			remarks: {
				type: DataTypes.STRING(200),
				allowNull: true,
			},
			is_lock: {
				type: DataTypes.BOOLEAN,
				defaultValue: true,
			},
			active_ph: {
				type: DataTypes.TINYINT,
				allowNull: true,
			},
			value_wise: {
				type: DataTypes.TINYINT,
				allowNull: true,
			},
			tax_duty_value_percentage: {
				type: DataTypes.DOUBLE,
				allowNull: true,
			},
			tax_duty_amount: {
				type: DataTypes.DOUBLE,
				allowNull: true,
			},
			lup_date: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			productSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			uom_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			createdAt: {
				allowNull: false,
				type: DataTypes.DATE,
			},
			updatedAt: {
				allowNull: false,
				type: DataTypes.DATE,
			},
		},
		{
			sequelize,
			modelName: 'Budget',
		},
	);
	return Budget;
};
