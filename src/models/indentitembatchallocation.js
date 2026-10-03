'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	// Which batches (and how much from each) an indent line was actually issued from.
	class IndentItemBatchAllocation extends Model {
		static associate(models) {
			IndentItemBatchAllocation.belongsTo(models.IndentItem, {
				foreignKey: 'indent_item_id',
				as: 'indent_item',
			});
		}
	}
	IndentItemBatchAllocation.init(
		{
			indent_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			indent_item_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			product_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			batch_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			batch_no: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			expiry_date: {
				type: DataTypes.DATEONLY,
				allowNull: true,
			},
			qty: {
				type: DataTypes.DECIMAL(18, 6),
				allowNull: false,
			},
			base_qty: {
				type: DataTypes.DECIMAL(18, 6),
				allowNull: false,
			},
			stock_ledger_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			issued_via: {
				type: DataTypes.STRING(20),
				allowNull: false,
			},
			issued_at: {
				type: DataTypes.DATE,
				allowNull: false,
			},
		},
		{
			sequelize,
			modelName: 'IndentItemBatchAllocation',
		},
	);
	return IndentItemBatchAllocation;
};
