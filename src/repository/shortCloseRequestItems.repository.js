const { Op } = require('sequelize');
const { ShortCloseRequestItem, ShortCloseRequest } = require('../models/index');

exports.bulkCreate = (rows, options = {}) => {
	return ShortCloseRequestItem.bulkCreate(rows, options);
};

exports.findAllForRequest = (shortCloseRequestId, options = {}) => {
	return ShortCloseRequestItem.findAll({
		where: { short_close_request_id: shortCloseRequestId },
		...options,
	});
};

// Only APPROVED requests carry a finalized release — draft/in_progress requests are still
// awaiting the approver and must not yet reduce a line's remaining qty (mirrors
// qcInspectionItemsRepository's FINALIZED_STATUSES gate); rejected/cancelled ones never
// happened as far as the PO/WO's fulfillment math is concerned.
const APPROVED_STATUSES = ['approved'];

// Σ short_close_qty across approved requests for this PO/WO line — the counterpart to
// qcInspectionItemsRepository.sumAcceptedQtyForPoWoItem, summed the same way rather than
// stored on the PO/WO item itself.
exports.sumApprovedQtyForPoWoItem = async (poWoItemId, options = {}) => {
	const total = await ShortCloseRequestItem.sum('short_close_qty', {
		where: { po_wo_item_id: poWoItemId },
		include: [
			{
				model: ShortCloseRequest,
				as: 'request',
				attributes: [],
				where: { status: { [Op.in]: APPROVED_STATUSES } },
			},
		],
		...options,
	});
	return total || 0;
};
