'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class IndentItem extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			IndentItem.belongsTo(models.Indent, {
				foreignKey: 'indent_id',
				as: 'indent',
			});
			IndentItem.belongsTo(models.Budget, {
				foreignKey: 'budget_id',
				as: 'budget',
			});
			IndentItem.hasMany(models.IndentSerialItem, {
				foreignKey: 'indent_item_id',
				as: 'serial_items',
			});
			IndentItem.belongsTo(models.RateContract, {
				foreignKey: 'rate_contract_id',
				as: 'rateContract',
			});
		}
	}
	IndentItem.init(
		{
			indent_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			budget_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			model_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			product_id: {
				type: DataTypes.INTEGER,
			},
			batch_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			stock_type: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			item_name: {
				type: DataTypes.STRING(200),
				allowNull: true,
			},
			item_code: {
				type: DataTypes.STRING(200),
				allowNull: true,
			},
			productSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			uom_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			uom_name: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			qty: {
				type: DataTypes.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			avg_rate: {
				type: DataTypes.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			discount: {
				type: DataTypes.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			amount: {
				type: DataTypes.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			requested_qty: {
				type: DataTypes.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			qty_issued: {
				type: DataTypes.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			// Base-UOM qty issued (for VCP rollback). qty_issued is in the selected UOM;
			// rollback-stock expects base UOM, so we store them separately.
			base_qty_issued: {
				type: DataTypes.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			minimum_stock_quantity: {
				type: DataTypes.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			checkMinimumStock: {
				type: DataTypes.BOOLEAN,
				defaultValue: 0,
			},
			qty_for_purchase_order: {
				type: DataTypes.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			qty_updated_by_verifier: {
				type: DataTypes.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			// Stock level at the moment verify/approve checked VCP — frozen, never recomputed.
			qty_in_stock: {
				type: DataTypes.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			// Separate post-approval backorder re-issue counter, mutated only by
			// indentService.reissuePendingQuantity (manual `POST /indents/:id/reissue`). NOT
			// touched by PO/WO create/update/delete/short-close — those all mutate
			// qty_for_purchase_order above, which is the field new-PO validation actually checks.
			balance_indent_qty: {
				type: DataTypes.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			days: {
				type: DataTypes.DATEONLY,
				allowNull: true,
			},
			specification: {
				type: DataTypes.STRING(200),
				allowNull: true,
			},
			issue_date: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			rate_contract_id: {
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
			modelName: 'IndentItem',
		},
	);
	return IndentItem;
};
