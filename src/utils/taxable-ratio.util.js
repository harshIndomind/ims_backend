/**
 * Returns the fraction of a PO/WO's grandTotal that is taxable value (i.e.
 * excludes GST). Used to strip the GST component out of a requisitioned
 * gross slice before computing TDS/GST-TDS, which by law (CBDT Circular
 * 23/2017 for income-tax TDS; Section 51 CGST Act for GST-TDS) must be
 * deducted on the taxable value only, not on a GST-inclusive amount.
 *
 * Expressed as a ratio (total_taxable / grandTotal) rather than tracking a
 * separate "remaining taxable value" so it applies uniformly to gross_amount
 * regardless of how that gross was derived (a flat % of the order, or a % of
 * whatever remains) — GST is a constant proportion of taxable value
 * throughout the order, so the ratio is invariant to which slice of it a
 * given requisition represents.
 *
 * Returns 1 (i.e. "don't strip anything out") if the order can't be found or
 * has no grandTotal — a safe fallback that reproduces the old (gross-based)
 * behavior rather than guessing.
 */
async function getTaxableRatio({ PurchaseOrder, WorkOrder, PurchaseInvoice, po_id, wo_id, purchase_invoice_id, transaction }) {
	// An Invoice-anchored requisition uses the invoice's OWN taxable/grand
	// totals, not the PO's — the invoice is the actual vendor bill, a more
	// accurate basis than the PO's estimate once one exists.
	const Model = po_id ? PurchaseOrder : wo_id ? WorkOrder : purchase_invoice_id ? PurchaseInvoice : null;
	const id = po_id || wo_id || purchase_invoice_id;
	if (!Model || !id) return 1;

	const order = await Model.findOne({ where: { id }, attributes: ['total_taxable', 'grandTotal'], transaction });
	if (!order) return 1;

	const taxable = parseFloat(order.total_taxable) || 0;
	const grand = parseFloat(order.grandTotal) || 0;
	if (grand <= 0) return 1;

	return taxable / grand;
}

module.exports = { getTaxableRatio };
