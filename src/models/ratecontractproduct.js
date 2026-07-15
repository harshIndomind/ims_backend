'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class RateContractProduct extends Model {
		static associate(models) {
			RateContractProduct.belongsTo(models.RateContract, {
				foreignKey: 'rate_contract_id',
				as: 'rateContract',
			});
		}
	}
	RateContractProduct.init(
		{
			rate_contract_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			product_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			productSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			uom_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			contract_rate: {
				type: DataTypes.DOUBLE,
				defaultValue: 0,
			},
			discount: {
				type: DataTypes.DOUBLE,
				defaultValue: 0,
			},
			special_discount: {
				type: DataTypes.DOUBLE,
				defaultValue: 0,
			},
			special_discount_details: {
				type: DataTypes.STRING,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'RateContractProduct',
		},
	);
	return RateContractProduct;
};
