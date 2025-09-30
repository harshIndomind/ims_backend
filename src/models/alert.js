'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Alert extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			Alert.belongsTo(models.User, { foreignKey: 'user_id' });
			Alert.hasMany(models.AlertRead, {
				foreignKey: 'alert_id',
				as: 'reads',
			});
		}
	}
	Alert.init(
		{
			user_id: { type: DataTypes.INTEGER, allowNull: false },
			title: { type: DataTypes.STRING, allowNull: false },
			description: { type: DataTypes.TEXT },
		},
		{
			sequelize,
			modelName: 'Alert',
		}
	);
	return Alert;
};
