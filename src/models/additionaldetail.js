'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class AdditionalDetail extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			AdditionalDetail.belongsTo(models.BusinessPartner, {
				foreignKey: 'partner_id',
			});
		}
	}
	AdditionalDetail.init(
		{
			partner_id: DataTypes.BIGINT,
			fax: DataTypes.STRING(50),
			website: DataTypes.STRING(150),
			credit_limit: DataTypes.DECIMAL(10, 2),
			due_days: DataTypes.INTEGER,
			note: DataTypes.TEXT,
		},
		{
			sequelize,
			modelName: 'AdditionalDetail',
		}
	);
	return AdditionalDetail;
};
