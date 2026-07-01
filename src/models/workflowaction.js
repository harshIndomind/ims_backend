'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class WorkflowAction extends Model {
		static associate(models) {
			WorkflowAction.belongsTo(models.WorkflowInstance, {
				foreignKey: 'workflow_instance_id',
			});
			WorkflowAction.belongsTo(models.WorkflowStage, {
				foreignKey: 'workflow_stage_id',
			});
		}
	}
	WorkflowAction.init(
		{
			workflow_instance_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			workflow_stage_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			action: {
				type: DataTypes.ENUM(
					'submitted',
					'verified',
					'approved',
					'rejected',
					'cancelled',
					'skipped',
					'resubmitted',
					'edited',
					'reopened',
					'archived',
					'restored',
				),
				allowNull: false,
			},
			performed_by: {
				type: DataTypes.JSON,
				allowNull: false,
			},
			performed_by_role: {
				type: DataTypes.STRING(150),
				allowNull: true,
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			metadata: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			createdAt: {
				allowNull: false,
				type: DataTypes.DATE,
			},
		},
		{
			sequelize,
			modelName: 'WorkflowAction',
			tableName: 'workflow_actions',
			updatedAt: false,
		},
	);
	return WorkflowAction;
};
