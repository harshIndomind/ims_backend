'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class GoodsReceiptNote extends Model {
		static associate(models) {
			GoodsReceiptNote.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			GoodsReceiptNote.belongsTo(models.PurchaseOrder, {
				foreignKey: 'purchase_order_id',
				as: 'purchaseOrder',
			});
			GoodsReceiptNote.hasMany(models.GoodsReceiptNoteItem, {
				foreignKey: 'goods_receipt_note_id',
				as: 'items',
			});
		}
	}
	GoodsReceiptNote.init(
		{
			org_id: DataTypes.INTEGER,
			purchase_order_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			grnPrefix: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			grnNo: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			grnPostfix: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			grn_date: {
				type: DataTypes.DATEONLY,
				allowNull: false,
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			received_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			status: {
				type: DataTypes.ENUM('active', 'cancelled'),
				allowNull: false,
				defaultValue: 'active',
			},
			cancelled_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			cancelled_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'GoodsReceiptNote',
		},
	);
	return GoodsReceiptNote;
};
