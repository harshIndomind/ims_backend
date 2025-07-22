'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class IssueLogs extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			IssueLogs.belongsTo(models.Issue, { foreignKey: 'issueId' });
			IssueLogs.belongsTo(models.User, { foreignKey: 'changedById' });
		}
	}
	IssueLogs.init(
		{
			issueId: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			changedById: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			isApproved: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
			},
			status: {
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
			modelName: 'IssueLogs',
		}
	);
	return IssueLogs;
};
