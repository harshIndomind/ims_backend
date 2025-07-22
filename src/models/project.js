'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Project extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// define association here
		}
	}
	Project.init(
		{
			company_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: { model: 'Companies', key: 'id' },
			},
			name: { type: DataTypes.STRING, allowNull: false },
			description: { type: DataTypes.TEXT, allowNull: false },
			status: {
				type: DataTypes.ENUM('not_started', 'in_progress', 'completed'),
				defaultValue: 'not_started',
				allowNull: false,
			},
			startDate: { type: DataTypes.DATE, allowNull: false },
			endDate: DataTypes.DATE,
			createdBy: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: {
					model: 'Users',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			},
		},
		{
			sequelize,
			modelName: 'Project',
		}
	);

	Project.associate = (models) => {
		// Project.belongsTo(models.Company, { foreignKey: 'company_id' });

		// Project.belongsTo(models.User, {
		// 	as: 'creator',
		// 	foreignKey: 'createdBy',
		// });

		// Project.belongsToMany(models.User, {
		// 	through: 'UserProjects',
		// 	as: 'users',
		// 	foreignKey: 'projectId',
		// 	otherKey: 'userId',
		// });
	};
	return Project;
};
