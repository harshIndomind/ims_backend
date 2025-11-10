'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class BankDetail extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			BankDetail.belongsTo(models.BusinessPartner, {
				foreignKey: 'partner_id',
			});
		}
	}
	BankDetail.init(
		{
			partner_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'BusinessPartners',
					key: 'id',
				},
			},
			bank_name: DataTypes.STRING(150),
			ifsc_code: DataTypes.STRING(20),
			account_no: DataTypes.STRING(50),
			branch_name: DataTypes.STRING(100),
		},
		{
			sequelize,
			modelName: 'BankDetail',
		}
	);
	return BankDetail;
};
