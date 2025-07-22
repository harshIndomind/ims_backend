'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class IssueAttachments extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			IssueAttachments.belongsTo(models.Issue, {
				foreignKey: 'issueId',
				as: 'issue',
			});
		}
	}
	IssueAttachments.init(
		{
			issueId: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: {
					model: 'Issues',
					key: 'id',
				},
			},
			filename: { type: DataTypes.STRING, allowNull: false },
			path: { type: DataTypes.STRING, allowNull: false },
			fileType: { type: DataTypes.STRING, allowNull: false },
		},
		{
			sequelize,
			modelName: 'IssueAttachments',
		}
	);
	return IssueAttachments;
};
