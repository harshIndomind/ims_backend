const { Op } = require('sequelize');
const { PurchaseInvoiceItem, PurchaseInvoice } = require('../models/index');

exports.bulkCreate = (rows, options = {}) => {
	return PurchaseInvoiceItem.bulkCreate(rows, options);
};

exports.findAllForInvoice = (purchaseInvoiceId, options = {}) => {
	return PurchaseInvoiceItem.findAll({
		where: { purchase_invoice_id: purchaseInvoiceId },
		...options,
	});
};

// Only rejected/cancelled invoices never happened as far as the PO's fulfillment
// math is concerned — draft/in_progress/approved invoices all hold their qty
// against the PO item (same "live unless rejected/cancelled" convention as
// short-close's own sumApprovedQtyForPoWoItem, adapted here since an invoice's
// hard-block matters from the moment it's created, not only once approved —
// two invoices being drafted concurrently against the same PO item must still
// see each other's claimed qty).
const LIVE_STATUSES = ['draft', 'in_progress', 'approved'];

// Σ invoiced_qty across live invoices for this PO/WO item — the ceiling
// createPurchaseInvoice's hard-block check compares against MRN received_qty
// (PO) or QC accepted_qty / ordered_qty (WO).
exports.sumInvoicedQtyForPoWoItem = async (poWoItemId, { excludeInvoiceId, transaction } = {}) => {
	const total = await PurchaseInvoiceItem.sum('invoiced_qty', {
		where: {
			po_wo_item_id: poWoItemId,
			...(excludeInvoiceId ? { purchase_invoice_id: { [Op.ne]: excludeInvoiceId } } : {}),
		},
		include: [
			{
				model: PurchaseInvoice,
				as: 'purchaseInvoice',
				attributes: [],
				where: { status: { [Op.in]: LIVE_STATUSES } },
			},
		],
		transaction,
	});
	return total || 0;
};
