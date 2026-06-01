'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class WorkOrderItem extends Model {
		static associate(models) {
			WorkOrderItem.belongsTo(models.WorkOrder, {
				foreignKey: 'work_order_id',
				as: 'workOrder',
			});
		}
	}
	WorkOrderItem.init(
		{
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: DataTypes.INTEGER,
			},
			work_order_id: {
				type: DataTypes.INTEGER,
				references: { model: 'WorkOrders', key: 'id' },
				onDelete: 'CASCADE',
			},
			budget_id: {
				type: DataTypes.INTEGER,
				references: { model: 'Budgets', key: 'id' },
				onDelete: 'CASCADE',
			},
			budget_no: {
				type: DataTypes.STRING,
				allowNull: true,
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
			modelName: 'WorkOrderItem',
		},
	);
	return WorkOrderItem;
};
