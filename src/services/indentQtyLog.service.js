/**
 * Shared quantity-change ledger for IndentItem.qty_for_purchase_order and .balance_indent_qty.
 *
 * Both fields are mutated from several places (indent approval, PO submit/delete, WO
 * create/update/delete, Short Close approval, manual re-issue — see indent_po_reissue_semantics
 * and short_close_architecture_plan) with no per-event history before this. This module is the
 * single place that writes that history, called explicitly at each mutation site (not a Sequelize
 * hook — IndentItemRepository.increment/IndentItem.increment bypass instance hooks, so a hook
 * would silently miss most of the call sites).
 */
const { indentItemQtyLogRepository } = require('../repository/index');
const logger = require('../utils/logger');

function actorFromReq(req) {
	const user = req?.user;
	return user ? { id: user.id, name: user.name, email: user.email } : null;
}

/**
 * Records one qty-change event. Always called alongside the mutation inside the same
 * transaction — a write failure throws and rolls back with it, same convention as
 * auditLog.service.js's transactional path (history must never silently diverge from the
 * qty it's supposed to be recording).
 */
async function record({
	req,
	indentItemId,
	indentId,
	productId = null,
	field,
	delta,
	previousValue,
	newValue,
	source,
	sourceRefId = null,
	vendorId = null,
	vendorSnapshot = null,
	workOrderId = null,
	remarks = null,
	transaction,
}) {
	if (!indentItemId || !indentId || !field || !source || delta === undefined || delta === null) {
		logger.warn('indentQtyLog.record called with missing required fields, skipping', {
			indentItemId,
			indentId,
			field,
			source,
		});
		return null;
	}

	const resolvedNewValue = newValue !== undefined && newValue !== null ? newValue : (previousValue ?? 0) + delta;

	return indentItemQtyLogRepository.create(
		{
			org_id: req?.user?.org_id ?? null,
			indent_id: indentId,
			indent_item_id: indentItemId,
			product_id: productId,
			field,
			source,
			source_ref_id: sourceRefId,
			vendor_id: vendorId,
			vendor_snapshot: vendorSnapshot,
			work_order_id: workOrderId,
			delta,
			previous_value: previousValue ?? 0,
			new_value: resolvedNewValue,
			performed_by: actorFromReq(req),
			remarks,
		},
		{ transaction },
	);
}

module.exports = { record };
