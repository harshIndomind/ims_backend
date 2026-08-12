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
			GoodsReceiptNoteItem.belongsTo(models.QcInspectionItem, {
				foreignKey: 'qc_inspection_item_id',
				as: 'qcInspectionItem',
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
			qc_inspection_item_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'qc_inspection_items', key: 'id' },
			},
		},
		{
			sequelize,
			modelName: 'GoodsReceiptNoteItem',
		},
	);
	return GoodsReceiptNoteItem;
};
