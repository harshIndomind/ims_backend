'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class GoodsReceiptNoteItem extends Model {
		static associate(models) {
			GoodsReceiptNoteItem.belongsTo(models.GoodsReceiptNote, {
				foreignKey: 'goods_receipt_note_id',
				as: 'goodsReceiptNote',
			});
			GoodsReceiptNoteItem.belongsTo(models.PurchaseOrderItem, {
				foreignKey: 'purchase_order_item_id',
				as: 'purchaseOrderItem',
			});
		}
	}
	GoodsReceiptNoteItem.init(
		{
			goods_receipt_note_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			purchase_order_item_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			product_id: DataTypes.INTEGER,
			batch_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			stock_type: DataTypes.ENUM(['normal', 'batch', 'serial']),
			received_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
			},
			serial_nos: {
				type: DataTypes.JSON,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'GoodsReceiptNoteItem',
		},
	);
	return GoodsReceiptNoteItem;
};
