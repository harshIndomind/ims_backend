'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
	class TdsSettlement extends Model {
		static associate(models) {
			TdsSettlement.hasMany(models.TdsSettlementAllocation, {
				foreignKey: 'tds_settlement_id',
				as: 'allocations',
			});
		}
	}

	TdsSettlement.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			settlement_date: {
				type: DataTypes.DATEONLY,
				allowNull: false,
			},
			challan_number: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			total_amount: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			payment_mode: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			bank_reference: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			status: {
				type: DataTypes.ENUM('ACTIVE', 'REVERSED'),
				allowNull: false,
				defaultValue: 'ACTIVE',
			},
			reversed_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			reversed_by_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			reversal_reason: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			created_by_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			updated_by_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
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
			modelName: 'TdsSettlement',
		},
	);

	return TdsSettlement;
};
