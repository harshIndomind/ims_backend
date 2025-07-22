'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class IssueHistory extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// define association here
		}
	}
	IssueHistory.init(
		{
			issueId: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			changedById: {
				type: DataTypes.INTEGER, // userId jisne change kiya
				allowNull: false,
			},
			oldStatus: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			newStatus: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			changedAt: {
				type: DataTypes.DATE,
				defaultValue: DataTypes.NOW,
			},
			comment: DataTypes.STRING,
		},
		{
			sequelize,
			modelName: 'IssueHistory',
		}
	);

	IssueHistory.associate = (models) => {
		IssueHistory.belongsTo(models.Issue, { foreignKey: 'issueId' });
		IssueHistory.belongsTo(models.User, { foreignKey: 'changedById' });
	};
	return IssueHistory;
};
