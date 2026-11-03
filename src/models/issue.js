'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Issue extends Model {
		static associate(models) {
			Issue.belongsTo(models.Project, { foreignKey: 'project_id', as: 'project' });
			Issue.belongsTo(models.User, { foreignKey: 'reporter_id', as: 'reporter' });
			Issue.belongsTo(models.User, { foreignKey: 'assignee_id', as: 'assignee' });
		}
	}
	Issue.init(
		{
			org_id: { type: DataTypes.INTEGER, allowNull: true },
			project_id: { type: DataTypes.INTEGER, allowNull: false },
			title: { type: DataTypes.STRING(255), allowNull: false },
			description: { type: DataTypes.TEXT('long'), allowNull: true },
			priority: {
				type: DataTypes.ENUM('low', 'medium', 'high'),
				allowNull: false,
				defaultValue: 'medium',
			},
			issue_status: {
				type: DataTypes.ENUM('open', 'in_progress', 'resolved', 'closed'),
				allowNull: false,
				defaultValue: 'open',
			},
			reporter_id: { type: DataTypes.INTEGER, allowNull: true },
			assignee_id: { type: DataTypes.INTEGER, allowNull: true },
			updated_by: { type: DataTypes.INTEGER, allowNull: true },
		},
		{
			sequelize,
			timestamps: true,
			modelName: 'Issue',
			tableName: 'issues',
		},
	);
	return Issue;
};