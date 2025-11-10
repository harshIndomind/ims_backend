'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class OpeningBalance extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			OpeningBalance.belongsTo(models.BusinessPartner, {
				foreignKey: 'partner_id',
			});
		}
	}
	OpeningBalance.init(
		{
			partner_id: DataTypes.INTEGER,
			partner_type: DataTypes.ENUM('vendor', 'customer'),
			balance_type: DataTypes.ENUM('credit', 'debit'),
			amount: DataTypes.DECIMAL(10, 2),
		},
		{
			sequelize,
			modelName: 'OpeningBalance',
		}
	);
	return OpeningBalance;
};
