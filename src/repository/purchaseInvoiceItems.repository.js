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

// Batched version of sumInvoicedQtyForPoWoItem for read/listing paths that need this for many
// WO items at once (e.g. Indent list/detail's "Actual Issue"/"Pending Re-issue" figures for
// service lines) — one grouped query instead of one query per item. Unlike the singular
// ceiling-check version above, this one only counts *approved* invoices: those figures are
// meant to reflect what's actually been delivered, so a draft/in-progress invoice (still
// editable, not yet vendor-confirmed) must not move them — only approval should. Returns a
// Map<po_wo_item_id, invoiced_qty>; an id with no approved invoice rows is simply absent
// (caller treats a missing key as 0).
exports.sumInvoicedQtyForPoWoItems = async (poWoItemIds, { transaction } = {}) => {
	if (!poWoItemIds?.length) return new Map();
	const rows = await PurchaseInvoiceItem.findAll({
		attributes: ['po_wo_item_id', [PurchaseInvoiceItem.sequelize.fn('SUM', PurchaseInvoiceItem.sequelize.col('invoiced_qty')), 'total']],
		where: { po_wo_item_id: { [Op.in]: poWoItemIds } },
		include: [
			{
				model: PurchaseInvoice,
				as: 'purchaseInvoice',
				attributes: [],
				where: { status: 'approved' },
			},
		],
		group: ['PurchaseInvoiceItem.po_wo_item_id'],
		raw: true,
		transaction,
	});
	return new Map(rows.map((r) => [r.po_wo_item_id, parseFloat(r.total || 0)]));
};
