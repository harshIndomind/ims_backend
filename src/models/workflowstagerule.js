'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class WorkflowStageRule extends Model {
		static associate(models) {
			WorkflowStageRule.belongsTo(models.WorkflowStage, {
				foreignKey: 'workflow_stage_id',
			});
			WorkflowStageRule.belongsTo(models.Role, {
				foreignKey: 'role_id',
			});
			WorkflowStageRule.belongsTo(models.Designation, {
				foreignKey: 'designation_id',
			});
		}
	}
	WorkflowStageRule.init(
		{
			workflow_stage_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			rule_type: {
				type: DataTypes.ENUM(
					'role',
					'user',
					'department_role',
					'store_role',
					'designation',
					'organization',
					'dynamic_resolver',
					'reporting_manager',
					'group',
				),
				allowNull: false,
			},
			role_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			user_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			designation_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			resolver_key: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			condition_field: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			condition_operator: {
				type: DataTypes.ENUM('gte', 'lte', 'eq', 'between'),
				allowNull: true,
			},
			condition_value: {
				type: DataTypes.STRING(255),
				allowNull: true,
			},
			condition_value_to: {
				type: DataTypes.STRING(255),
				allowNull: true,
			},
			match_mode: {
				type: DataTypes.ENUM('any', 'all'),
				defaultValue: 'any',
			},
		},
		{
			sequelize,
			modelName: 'WorkflowStageRule',
			tableName: 'workflow_stage_rules',
		},
	);
	return WorkflowStageRule;
};
