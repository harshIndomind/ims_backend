'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class WorkflowDefinition extends Model {
		static associate(models) {
			WorkflowDefinition.hasMany(models.WorkflowStage, {
				foreignKey: 'workflow_definition_id',
				as: 'stages',
			});
		}
	}
	WorkflowDefinition.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			document_type: {
				type: DataTypes.STRING(50),
				allowNull: false,
			},
			name: {
				type: DataTypes.STRING(150),
				allowNull: false,
			},
			description: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			is_active: {
				type: DataTypes.BOOLEAN,
				defaultValue: true,
			},
			is_default: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			version: {
				type: DataTypes.INTEGER,
				defaultValue: 1,
			},
			lock_stage_sequence: {
				type: DataTypes.INTEGER,
				defaultValue: 1,
			},
			restart_on_edit_after_rejection: {
				type: DataTypes.BOOLEAN,
				defaultValue: true,
			},
			createdBy: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			updatedBy: {
				type: DataTypes.JSON,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'WorkflowDefinition',
			tableName: 'workflow_definitions',
		},
	);
	return WorkflowDefinition;
};
