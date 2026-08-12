'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class QcInspectionItem extends Model {
		static associate(models) {
			QcInspectionItem.belongsTo(models.QcInspection, {
				foreignKey: 'qc_inspection_id',
				as: 'inspection',
			});
			QcInspectionItem.belongsTo(models.MasterQcRejectionReason, {
				foreignKey: 'rejection_reason_id',
				as: 'rejectionReason',
			});
			QcInspectionItem.hasMany(models.QcResult, {
				foreignKey: 'qc_inspection_item_id',
				as: 'results',
			});
			QcInspectionItem.hasMany(models.GoodsReceiptNoteItem, {
				foreignKey: 'qc_inspection_item_id',
				as: 'grnItems',
			});
		}
	}
	QcInspectionItem.init(
		{
			qc_inspection_id: {
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
			stock_type: {
				type: DataTypes.ENUM('normal', 'batch', 'serial'),
				allowNull: true,
			},
			ordered_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			previously_received_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			// Cumulative accepted_qty across all prior finalized inspections for this po_wo_item,
			// snapshotted at deriveInspectionItems time — same frozen-at-creation pattern as
			// previously_received_qty. Drives the "Remaining to Fulfill" figure (ordered −
			// previously_accepted − this round's accepted), which unlike "Pending" (ordered −
			// received) stays correct through rejection/replacement cycles: a rejected unit
			// consumes received qty without ever counting as accepted, so only an accepted-based
			// figure answers "how much does the vendor still owe us."
			previously_accepted_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			// Same frozen-at-creation snapshot as previously_accepted_qty, but for rejected_qty —
			// drives the QC screen's "QC Rejected" figure (previously_rejected_qty + this round's
			// rejected_qty), the rejected-side counterpart to "QC Accepted".
			previously_rejected_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			current_received_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			total_received_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			pending_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			inspected_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			accepted_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			rejected_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			rework_qty: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			result: {
				type: DataTypes.ENUM('pending', 'passed', 'partial', 'failed'),
				allowNull: false,
				defaultValue: 'pending',
			},
			rejection_reason_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'MasterQcRejectionReasons', key: 'id' },
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			serial_nos: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			rejected_serial_nos: {
				type: DataTypes.JSON,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'QcInspectionItem',
			tableName: 'qc_inspection_items',
		},
	);
	return QcInspectionItem;
};
