'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class PurchaseOrderItem extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of DataTypes lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			PurchaseOrderItem.belongsTo(models.PurchaseOrder, {
				foreignKey: 'purchase_order_id',
				as: 'purchaseOrder',
			});
			PurchaseOrderItem.hasMany(models.PurchaseOrderSerialItem, {
				foreignKey: 'purchase_order_item_id',
				as: 'serial_items',
			});
		}
	}
	PurchaseOrderItem.init(
		{
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: DataTypes.INTEGER,
			},
			purchase_order_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'PurchaseOrders',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			budget_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'Budgets',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			budget_no: {
				type: DataTypes.STRING,
				allowNull: true
			},
			product_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			productSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			batch_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			batchSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			selected_uom_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			uomSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			hsn_sac_code: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			qty: {
				type: DataTypes.DECIMAL(15, 2),
			},
			price: {
				type: DataTypes.DECIMAL(15, 2),
			},
			discount: {
				type: DataTypes.DECIMAL(15, 2),
			},
			discount_price_type: {
				type: DataTypes.ENUM(['rupee', 'percentage']),
			},
			tax_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			taxSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			igst: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
			cgst: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
			sgst: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
			cess: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
			total: DataTypes.DECIMAL(15, 2),
			stock_type: DataTypes.ENUM(['normal', 'batch', 'serial']),
			note: { type: DataTypes.TEXT, allowNull: true },
			specification: { type: DataTypes.TEXT, allowNull: true },
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
			modelName: 'PurchaseOrderItem',
		},
	);
	return PurchaseOrderItem;
};
