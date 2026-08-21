'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
	class TdsSettlementAllocation extends Model {
		static associate(models) {
			TdsSettlementAllocation.belongsTo(models.TdsSettlement, {
				foreignKey: 'tds_settlement_id',
				as: 'settlement',
			});
			TdsSettlementAllocation.belongsTo(models.TdsLiability, {
				foreignKey: 'tds_liability_id',
				as: 'liability',
			});
		}
	}

	TdsSettlementAllocation.init(
		{
			tds_settlement_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			tds_liability_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			allocated_amount: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			createdAt: {
				allowNull: false,
				type: DataTypes.DATE,
			},
			updatedAt: {
				allowNull: false,
				type: DataTypes.DATE,
			},
		},
		{
			sequelize,
			modelName: 'TdsSettlementAllocation',
		},
	);

	return TdsSettlementAllocation;
};
