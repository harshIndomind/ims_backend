'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class OrderAcknowledgementItem extends Model {
		static associate(models) {
			OrderAcknowledgementItem.belongsTo(models.OrderAcknowledgement, {
				foreignKey: 'acknowledgement_id',
				as: 'acknowledgement',
			});
		}
	}
	OrderAcknowledgementItem.init(
		{
			acknowledgement_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			po_wo_item_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			product_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			batch_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			stock_type: {
				type: DataTypes.ENUM('normal', 'batch', 'serial'),
				allowNull: true,
			},
			// Optional/informational only — Acknowledgement confirms the vendor accepted the PO/WO
			// document, not that goods physically arrived. Physical receipt is captured on the QC
			// inspection itself (qc_inspection_items.current_received_qty).
			arrived_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: true,
			},
			damage_notes: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'OrderAcknowledgementItem',
			tableName: 'order_acknowledgement_items',
		},
	);
	return OrderAcknowledgementItem;
};
