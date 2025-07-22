'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Issue extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// define association here
		}
	}
	Issue.init(
		{
			title: { type: DataTypes.STRING, allowNull: false },
			description: { type: DataTypes.TEXT, allowNull: false },
			priority: {
				type: DataTypes.ENUM('low', 'medium', 'high'),
				defaultValue: 'medium',
				allowNull: false,
			},
			status: {
				type: DataTypes.ENUM('open', 'in_progress', 'resolved', 'closed'),
				defaultValue: 'open',
				allowNull: false,
			},
			projectId: {
				type: DataTypes.INTEGER,
				references: { model: 'Projects', key: 'id' },
				allowNull: false,
			},
			reporterId: {
				type: DataTypes.INTEGER,
				references: { model: 'Users', key: 'id' },
				allowNull: false,
			},
			assigneeId: {
				type: DataTypes.INTEGER,
				references: { model: 'Users', key: 'id' },
				allowNull: false,
			},
			isApproved: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},
		},
		{
			sequelize,
			modelName: 'Issue',
		}
	);

	Issue.associate = (models) => {
		Issue.belongsTo(models.Project, {
			foreignKey: 'projectId',
			as: 'project',
		});

		Issue.belongsTo(models.User, {
			foreignKey: 'reporterId',
			as: 'reporter',
		});

		Issue.belongsTo(models.User, {
			foreignKey: 'assigneeId',
			as: 'assignee',
		});

		Issue.hasMany(models.IssueAttachments, {
			foreignKey: 'issueId',
			as: 'attachments',
			onDelete: 'CASCADE',
		});
	};

	return Issue;
};
