'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class UserProject extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			UserProject.belongsTo(models.User, { foreignKey: 'userId' });
			UserProject.belongsTo(models.Project, { foreignKey: 'projectId' });
		}
	}
	UserProject.init(
		{
			userId: DataTypes.INTEGER,
			projectId: DataTypes.INTEGER,
		},
		{
			sequelize,
			modelName: 'UserProject',
		}
	);

	return UserProject;
};
