const { Op } = require('sequelize');
const { QcInspectionItem, QcInspection } = require('../models/index');

exports.bulkCreate = (rows, options = {}) => {
	return QcInspectionItem.bulkCreate(rows, options);
};

exports.findById = (id, options = {}) => {
	return QcInspectionItem.findByPk(id, options);
};

exports.findAllForInspection = (qcInspectionId, options = {}) => {
	return QcInspectionItem.findAll({
		where: { qc_inspection_id: qcInspectionId },
		...options,
	});
};

// Only inspections that have been submitted (completed) or approved carry finalized quantities —
// pending/assigned/in_progress inspections are drafts whose qty fields can still change, and
// rejected/cancelled ones never happened as far as the PO/WO's fulfillment math is concerned.
const FINALIZED_STATUSES = ['completed', 'approved'];

async function sumFinalizedQtyForPoWoItem(poWoItemId, field, options = {}) {
	const total = await QcInspectionItem.sum(field, {
		where: { po_wo_item_id: poWoItemId },
		include: [
			{
				model: QcInspection,
				as: 'inspection',
				attributes: [],
				where: { status: { [Op.in]: FINALIZED_STATUSES } },
			},
		],
		...options,
	});
	return total || 0;
}

// Ordered − Σ accepted_qty across finalized inspections = the qty still awaiting acceptance for
// this PO/WO line. Drives "Create QC Inspection" gating and PO/WO completion — NOT the same as
// the per-item "Pending Qty" shown on the QC screen itself (which is ordered − received).
exports.sumAcceptedQtyForPoWoItem = (poWoItemId, options = {}) => sumFinalizedQtyForPoWoItem(poWoItemId, 'accepted_qty', options);

// Σ current_received_qty across finalized inspections = "Previously Received Qty" shown on a new
// QC inspection for this line.
exports.sumReceivedQtyForPoWoItem = (poWoItemId, options = {}) => sumFinalizedQtyForPoWoItem(poWoItemId, 'current_received_qty', options);

// Σ rejected_qty across finalized inspections = "QC Rejected" (previously_rejected_qty) shown on
// a new QC inspection for this line — the rejected-side counterpart to sumAcceptedQtyForPoWoItem.
exports.sumRejectedQtyForPoWoItem = (poWoItemId, options = {}) => sumFinalizedQtyForPoWoItem(poWoItemId, 'rejected_qty', options);
