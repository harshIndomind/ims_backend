/**
 * Reusable Indent → PO/WO budget-commitment guard.
 *
 * Budget enforcement in this codebase happens in two independent layers, matched to where
 * Budget actually attaches in the data model:
 *
 *   - Budget → Indent: `budget_id`/`amount` live on IndentItem; enforced in indent.service.js
 *     (validateBudgetPhaseOnCreate / validateIndentBudgetAmount) at indent create/update/approve.
 *   - Indent → PO/WO: qty is capped via IndentItem.qty_for_purchase_order for 'item-wise'
 *     budgets (see purchase-order.service.js's validateItemsLimits / work-order.service.js's
 *     inline qty check), but that qty cap is explicitly SKIPPED for 'value-wise' budgets
 *     ("Value-wise indents are controlled by amount, not qty") — and no amount-based
 *     replacement was ever implemented, meaning a value-wise indent's PO/WO commitment was
 *     completely unbounded before this module. This file is that missing replacement.
 *
 * A 'value-wise' IndentItem's own `amount` (its originally-indented line value) is the
 * ceiling at this layer: the sum of every PO + WO line committed against that IndentItem
 * (matched by indent_id + product_id, +uom_id for PO — the same keys applyIndentQtyDelta /
 * applyIndentQtyDeltaForWorkOrder already use) must never exceed it. Once every PO/WO is
 * capped at its indent line, the indent's own Budget↔Indent cap transitively bounds the
 * budget's total exposure — this module never re-reads Budget directly.
 *
 * IndentItem carries no tax/GST fields at all (see indentitem.js) — its `amount` is a
 * pre-tax figure. PO/WO item `total` is tax-INCLUSIVE (see charge-tax-engine.util.js). So the
 * "committed" side of every comparison here uses each PO/WO line's pre-tax taxable amount,
 * never its tax-inclusive `total` — comparing a tax-inclusive PO total against a tax-free
 * indent figure would trip this check on GST alone for every legitimate PO.
 */
const { Op } = require('sequelize');
const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const {
	Indent,
	IndentItem,
	PurchaseOrder,
	PurchaseOrderItem,
	WorkOrder,
	WorkOrderItem,
} = require('../models/index');

// A draft PO has never deducted anything from its indent (see purchase-order.service.js —
// the qty ledger only moves on submitPurchaseOrder); the amount ledger mirrors that exactly,
// so draft/cancelled/rejected PO lines must not count as committed.
const PO_UNCOMMITTED_STATUSES = ['draft', 'cancelled', 'rejected'];
// A WO only commits against its indent once approved (work-order.service.js's
// approveWorkOrder calls applyIndentQtyDeltaForWorkOrder there, and only on the stage
// that actually resolves to 'approved') — draft/in_progress/cancelled/rejected WO lines
// never commit anything, so only 'approved' counts here (see getCommittedTaxableAmount).

function round2(n) {
	return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function isBaseUom(uomId) {
	return uomId === null || uomId === undefined || Number(uomId) === 0;
}

/** Tax-inclusive `total` minus its own tax/cess components = the pre-tax taxable amount. */
function taxableAmountOf(row) {
	const total = Number(row.total || 0);
	const tax = Number(row.igst || 0) + Number(row.cgst || 0) + Number(row.sgst || 0);
	const cess = Number(row.cess || 0);
	return total - tax - cess;
}

/**
 * Finds + row-locks the IndentItem a PO/WO line commits against. Locking here, inside the
 * caller's transaction, is what makes two concurrent PO/WO submissions against the same
 * indent line serialize instead of both reading the same "already committed" sum and both
 * passing validation before either writes.
 */
async function lockIndentItem({ indent_id, product_id, uom_id, matchUom, transaction }) {
	if (!indent_id || !product_id) return null;
	const where = { indent_id, product_id };
	if (matchUom) {
		where.uom_id = isBaseUom(uom_id) ? { [Op.or]: [null, 0] } : uom_id;
	}
	return IndentItem.findOne({
		where,
		include: [{ model: Indent, as: 'indent', attributes: ['id', 'budgetType'] }],
		transaction,
		lock: transaction.LOCK.UPDATE,
	});
}

/** Sums the currently-committed taxable amount from active PO + WO lines against one IndentItem. */
async function getCommittedTaxableAmount({
	indentItem,
	matchUom,
	excludePurchaseOrderId,
	excludeWorkOrderId,
	transaction,
}) {
	const poWhere = { product_id: indentItem.product_id };
	if (matchUom) {
		poWhere.selected_uom_id = isBaseUom(indentItem.uom_id) ? null : indentItem.uom_id;
	}

	const poRows = await PurchaseOrderItem.findAll({
		where: poWhere,
		include: [
			{
				model: PurchaseOrder,
				as: 'purchaseOrder',
				attributes: [],
				required: true,
				where: {
					indent_id: indentItem.indent_id,
					status: { [Op.notIn]: PO_UNCOMMITTED_STATUSES },
					...(excludePurchaseOrderId ? { id: { [Op.ne]: excludePurchaseOrderId } } : {}),
				},
			},
		],
		transaction,
	});

	const woRows = await WorkOrderItem.findAll({
		where: { product_id: indentItem.product_id },
		include: [
			{
				model: WorkOrder,
				as: 'workOrder',
				attributes: [],
				required: true,
				where: {
					indent_id: indentItem.indent_id,
					status: 'approved',
					...(excludeWorkOrderId ? { id: { [Op.ne]: excludeWorkOrderId } } : {}),
				},
			},
		],
		transaction,
	});

	const poAmount = poRows.reduce((sum, r) => sum + taxableAmountOf(r), 0);
	const woAmount = woRows.reduce((sum, r) => sum + taxableAmountOf(r), 0);
	return round2(poAmount + woAmount);
}

/**
 * Validates one product/UOM's requested PO/WO commitment against its Indent line's
 * remaining 'value-wise' budget headroom. No-ops when the indent line isn't value-wise, or
 * carries no `budget_id` — item-wise stays governed by the pre-existing qty_for_purchase_order
 * cap, and a line with no Budget link is out of scope by the existing data model (nothing
 * new invented here).
 *
 * @param {number} requestedTaxableAmount - the combined pre-tax value of every line the
 *   caller is about to persist for this product/UOM on the document being created/updated.
 * @param {number} [excludePurchaseOrderId] - when editing a PO, its own id — so its own
 *   pre-edit lines aren't counted as "already committed" on top of the new requested amount.
 * @param {number} [excludeWorkOrderId] - same, for editing a WO.
 */
async function validateIndentLineBudget({
	indent_id,
	product_id,
	uom_id,
	matchUom,
	requestedTaxableAmount,
	excludePurchaseOrderId,
	excludeWorkOrderId,
	documentLabel,
	transaction,
}) {
	if (!indent_id || !transaction) return;

	const indentItem = await lockIndentItem({ indent_id, product_id, uom_id, matchUom, transaction });
	if (!indentItem) return; // No matching indent line — nothing to guard (mirrors applyIndentQtyDelta's own no-op).
	if (!indentItem.budget_id) return; // Not linked to a Budget at all.
	if (indentItem.indent?.budgetType !== 'value-wise') return; // item-wise stays qty-controlled.

	const indentAmount = round2(Number(indentItem.amount || 0));
	const committed = await getCommittedTaxableAmount({
		indentItem,
		matchUom,
		excludePurchaseOrderId,
		excludeWorkOrderId,
		transaction,
	});
	const requested = round2(Number(requestedTaxableAmount || 0));
	const available = round2(indentAmount - committed);
	const excess = round2(requested - available);

	if (excess > 0) {
		const name = indentItem.item_name || `product ${product_id}`;
		throw new AppError(
			`Budget limit exceeded for "${name}". ` +
				`Indent Amount: ${indentAmount.toFixed(2)}, Already Committed: ${committed.toFixed(2)}, ` +
				`Available Amount: ${available.toFixed(2)}, Requested Amount${documentLabel ? ` (${documentLabel})` : ''}: ${requested.toFixed(2)}, ` +
				`Excess Amount: ${excess.toFixed(2)}.`,
			StatusCodes.BAD_REQUEST,
		);
	}
}

/**
 * Validates every line of a PO/WO payload against its indent line's remaining value-wise
 * budget headroom, one IndentItem-lock at a time.
 *
 * @param {{product_id: number, uom_id?: number|null, taxableAmount: number}[]} lines
 */
async function validateDocumentAgainstIndentBudget({
	indent_id,
	lines,
	matchUom,
	excludePurchaseOrderId,
	excludeWorkOrderId,
	documentLabel,
	transaction,
}) {
	// Group defensively so each IndentItem is locked and checked exactly once per call,
	// against its lines' combined requested amount (a document could in principle carry more
	// than one line for the same product/UOM even where PO's own validateItemsLimits already
	// rejects that case for PO specifically).
	const groups = new Map();
	for (const line of lines) {
		const key = matchUom ? `${line.product_id}:${line.uom_id ?? 'base'}` : String(line.product_id);
		if (!groups.has(key)) {
			groups.set(key, { product_id: line.product_id, uom_id: line.uom_id, amount: 0 });
		}
		groups.get(key).amount += Number(line.taxableAmount || 0);
	}

	for (const { product_id, uom_id, amount } of groups.values()) {
		await validateIndentLineBudget({
			indent_id,
			product_id,
			uom_id,
			matchUom,
			requestedTaxableAmount: amount,
			excludePurchaseOrderId,
			excludeWorkOrderId,
			documentLabel,
			transaction,
		});
	}
}

module.exports = {
	validateIndentLineBudget,
	validateDocumentAgainstIndentBudget,
	taxableAmountOf,
};
