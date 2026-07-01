'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class AuditLog extends Model {
		static associate(models) {
			// Intentionally no associations — polymorphic (entity_type + entity_id),
			// queried directly rather than joined.
		}
	}
	AuditLog.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			entity_type: {
				type: DataTypes.STRING(50),
				allowNull: false,
			},
			entity_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			action: {
				type: DataTypes.STRING(50),
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
			previous_state: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			new_state: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			changed_data: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			ip_address: {
				type: DataTypes.STRING(64),
				allowNull: true,
			},
			user_agent: {
				type: DataTypes.STRING(255),
				allowNull: true,
			},
			workflow_stage_name: {
				type: DataTypes.STRING(150),
				allowNull: true,
			},
			createdAt: {
				allowNull: false,
				type: DataTypes.DATE,
			},
		},
		{
			sequelize,
			modelName: 'AuditLog',
			tableName: 'audit_logs',
			updatedAt: false,
		},
	);
	return AuditLog;
};
