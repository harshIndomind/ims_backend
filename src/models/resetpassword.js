'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class ResetPassword extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			ResetPassword.belongsTo(models.User, {
				foreignKey: 'userId',
				onDelete: 'CASCADE',
			});
		}
	}
	ResetPassword.init(
		{
			userId: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: {
					model: 'Users',
					key: 'id',
				},
			},
			token: { type: DataTypes.STRING(256), allowNull: false },
			expiresAt: { type: DataTypes.DATE, allowNull: false },
		},
		{
			sequelize,
			modelName: 'ResetPassword',
		}
	);
	return ResetPassword;
};
