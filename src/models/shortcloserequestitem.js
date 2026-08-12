'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class ShortCloseRequestItem extends Model {
		static associate(models) {
			ShortCloseRequestItem.belongsTo(models.ShortCloseRequest, {
				foreignKey: 'short_close_request_id',
				as: 'request',
			});
		}
	}
	ShortCloseRequestItem.init(
		{
			short_close_request_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			// Polymorphic against purchase_order_items/work_order_items depending on the parent
			// request's document_type — same shape as qc_inspection_items.po_wo_item_id.
			po_wo_item_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			product_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			productSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			ordered_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			accepted_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			previously_short_closed_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			short_close_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'ShortCloseRequestItem',
			tableName: 'short_close_request_items',
		},
	);
	return ShortCloseRequestItem;
};
