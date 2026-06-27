'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class WorkflowInstance extends Model {
		static associate(models) {
			WorkflowInstance.belongsTo(models.WorkflowDefinition, {
				foreignKey: 'workflow_definition_id',
			});
			WorkflowInstance.belongsTo(models.WorkflowStage, {
				foreignKey: 'current_stage_id',
				as: 'currentStage',
			});
			WorkflowInstance.hasMany(models.WorkflowAction, {
				foreignKey: 'workflow_instance_id',
				as: 'actions',
			});
			// document_id is a polymorphic reference (document_type + document_id), never a
			// Sequelize association — keeps this model decoupled from any specific document.
		}
	}
	WorkflowInstance.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			document_type: {
				type: DataTypes.STRING(50),
				allowNull: false,
			},
			document_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			workflow_definition_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			current_stage_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			status: {
				type: DataTypes.ENUM('draft', 'in_progress', 'approved', 'rejected', 'cancelled'),
				defaultValue: 'draft',
			},
			started_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			completed_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			restart_count: {
				type: DataTypes.INTEGER,
				defaultValue: 0,
			},
			is_archived: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			archived_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			archived_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'WorkflowInstance',
			tableName: 'workflow_instances',
		},
	);
	return WorkflowInstance;
};
