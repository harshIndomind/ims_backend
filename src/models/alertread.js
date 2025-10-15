'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class AlertRead extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			AlertRead.belongsTo(models.Alert, { foreignKey: 'alert_id', onDelete: 'CASCADE' });
			AlertRead.belongsTo(models.User, { foreignKey: 'user_id', onDelete: 'CASCADE' });
		}
	}
	AlertRead.init(
		{
			alert_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			user_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			read_at: {
				type: DataTypes.DATE,
				defaultValue: DataTypes.NOW,
			},
		},
		{
			sequelize,
			modelName: 'AlertRead',
		}
	);
	return AlertRead;
};
