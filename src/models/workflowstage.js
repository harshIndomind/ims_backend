'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class WorkflowStage extends Model {
		static associate(models) {
			WorkflowStage.belongsTo(models.WorkflowDefinition, {
				foreignKey: 'workflow_definition_id',
			});
			WorkflowStage.hasMany(models.WorkflowStageRule, {
				foreignKey: 'workflow_stage_id',
				as: 'rules',
			});
		}
	}
	WorkflowStage.init(
		{
			workflow_definition_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			sequence: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			stage_key: {
				type: DataTypes.STRING(50),
				allowNull: false,
			},
			stage_name: {
				type: DataTypes.STRING(150),
				allowNull: false,
			},
			stage_type: {
				type: DataTypes.ENUM('maker', 'verification', 'approval', 'custom'),
				allowNull: false,
			},
			is_required: {
				type: DataTypes.BOOLEAN,
				defaultValue: true,
			},
			is_terminal_approval: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			allow_edit_before: {
				type: DataTypes.BOOLEAN,
				defaultValue: true,
			},
			sla_hours: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			approval_strategy: {
				type: DataTypes.ENUM('single', 'any_one', 'all_required', 'min_count'),
				defaultValue: 'single',
			},
			min_approvals: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			skip_condition_field: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			skip_condition_operator: {
				type: DataTypes.ENUM('gte', 'lte', 'eq', 'between'),
				allowNull: true,
			},
			skip_condition_value: {
				type: DataTypes.STRING(255),
				allowNull: true,
			},
			skip_condition_value_to: {
				type: DataTypes.STRING(255),
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'WorkflowStage',
			tableName: 'workflow_stages',
		},
	);
	return WorkflowStage;
};
