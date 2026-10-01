/**
 * Reusable Indent → PO/WO budget-commitment guard.
 *
 * Budget enforcement in this codebase happens in two independent layers, matched to where
 * Budget actually attaches in the data model:
 *
 *   - Budget → Indent: `budget_id`/`amount` live on IndentItem; enforced in indent.service.js
 *     (validateBudgetPhaseOnCreate) at indent create/update/approve.
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
	Budget,
	DocumentCharge,
	Indent,
	IndentItem,
	PurchaseOrder,
	PurchaseOrderItem,
	WorkOrder,
	WorkOrderItem,
	PurchaseInvoice,
	PurchaseInvoiceItem,
	PurchaseInvoiceCharge,
} = require('../models/index');
const shortCloseRequestItemsRepository = require('../repository/shortCloseRequestItems.repository');
const { calculateDocumentTotals, legacyCustomFieldsToCharges } = require('../utils/charge-tax-engine.util');
const { toEngineItems, dbRowsToCharges } = require('../utils/document-charges.helper');
const {
	computeDocumentBudgetComponents,
	budgetImpactOf,
	effectiveCommitmentLimit,
} = require('../utils/budget-limit.util');

// A draft PO has never deducted anything from its indent (see purchase-order.service.js —
// the qty ledger only moves on submitPurchaseOrder); the amount ledger mirrors that exactly,
// so draft/cancelled/rejected PO lines must not count as committed.
const PO_UNCOMMITTED_STATUSES = ['draft', 'cancelled', 'rejected'];
// A WO only commits against its indent once approved (work-order.service.js's
// approveWorkOrder calls applyIndentQtyDeltaForWorkOrder there, and only on the stage
// that actually resolves to 'approved') — draft/in_progress/cancelled/rejected WO lines
// never commit anything. 'completed' is an approved WO that has since been fully
// received/short-closed; it stays committed (it used to silently drop out of the sum).
const WO_COMMITTED_STATUSES = ['approved', 'completed'];

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
 * A PO/WO line's taxable amount, net of any qty approved-short-closed off of it.
 *
 * Short Close (see short-close.service.js) releases short-closed qty back onto
 * IndentItem.qty_for_purchase_order so a follow-up PO/WO can be raised for it, but it never
 * reduces the original PO/WO line's own `qty`/`total` (short-closed qty is always derived via
 * shortCloseRequestItemsRepository, same as QC's accepted_qty — never stored on the item). Left
 * unaccounted for here, that released qty would count as "committed" TWICE: once on the
 * original line (still carrying its full original amount) and again on the follow-up
 * document's own requested amount — permanently eating indent budget headroom that Short
 * Close was supposed to give back. Netting each line down to its still-active qty (qty minus
 * approved short-close qty) before summing "committed" fixes that.
 */
async function netTaxableAmount(row, transaction) {
	const total = taxableAmountOf(row);
	const qty = Number(row.qty || 0);
	if (!qty) return total;
	const shortClosedQty = Number(
		await shortCloseRequestItemsRepository.sumApprovedQtyForPoWoItem(row.id, { transaction }),
	);
	if (!shortClosedQty) return total;
	const netQty = Math.max(qty - shortClosedQty, 0);
	return (total / qty) * netQty;
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
					status: { [Op.in]: WO_COMMITTED_STATUSES },
					...(excludeWorkOrderId ? { id: { [Op.ne]: excludeWorkOrderId } } : {}),
				},
			},
		],
		transaction,
	});

	const [poAmounts, woAmounts] = await Promise.all([
		Promise.all(poRows.map((r) => netTaxableAmount(r, transaction))),
		Promise.all(woRows.map((r) => netTaxableAmount(r, transaction))),
	]);
	const poAmount = poAmounts.reduce((sum, a) => sum + a, 0);
	const woAmount = woAmounts.reduce((sum, a) => sum + a, 0);
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

// ---------------------------------------------------------------------------------------
// Budget-level commitment limit (both item-wise and value-wise budgets).
//
// The indent-line check above bounds each PO/WO line's *item value* by its indent line; it
// never sees charges or tax, and it no-ops for item-wise budgets entirely. This layer re-reads
// the Budget itself: Σ budget impact (taxable + budget-impacting charges + non-recoverable
// tax, see budget-limit.util.js) of every committed PO/WO line against a budget must stay
// within its commitment limit (base + tax-if-non-recoverable + provision) + approved revisions.
// ---------------------------------------------------------------------------------------

const DOC_CONFIG = {
	purchase_order: {
		model: PurchaseOrder,
		itemModel: PurchaseOrderItem,
		itemsAs: 'items',
		itemParentAs: 'purchaseOrder',
		itemParentKey: 'purchase_order_id',
		committedWhere: { status: { [Op.notIn]: PO_UNCOMMITTED_STATUSES } },
		invoiceParentKey: 'purchase_order_id',
		label: 'Purchase Order',
	},
	work_order: {
		model: WorkOrder,
		itemModel: WorkOrderItem,
		itemsAs: 'items',
		itemParentAs: 'workOrder',
		itemParentKey: 'work_order_id',
		committedWhere: { status: { [Op.in]: WO_COMMITTED_STATUSES } },
		invoiceParentKey: 'work_order_id',
		label: 'Work Order',
	},
};

/**
 * Engine-shaped totals for an already-persisted PO/WO: item figures come straight from the
 * stored (server-computed) item rows; charges from document_charges, or — for a pre-engine
 * document with no rows — its legacy customFields, re-run through the same engine the read
 * path already uses to reconstruct them.
 */
async function storedDocumentTotals(documentType, doc, items, transaction) {
	const rows = await DocumentCharge.findAll({
		where: { document_type: documentType, document_id: doc.id },
		order: [['sequence', 'ASC']],
		transaction,
	});

	const itemTotals = items.map((row) => ({
		taxableAmount: taxableAmountOf(row),
		taxAmount: Number(row.igst || 0) + Number(row.cgst || 0) + Number(row.sgst || 0),
		cess: Number(row.cess || 0),
	}));

	let charges;
	if (rows.length) {
		charges = dbRowsToCharges(rows).map((c) => ({
			...c,
			tax: Number(c.cgst || 0) + Number(c.sgst || 0) + Number(c.igst || 0),
		}));
	} else {
		const legacy = legacyCustomFieldsToCharges(doc.customFields);
		const recomputed = legacy.length
			? calculateDocumentTotals({ items: toEngineItems(items), charges: legacy, sameState: Boolean(doc.same_state) })
			: { preTaxCharges: [], postTaxCharges: [] };
		charges = [...recomputed.preTaxCharges, ...recomputed.postTaxCharges];
	}

	return { items: itemTotals, preTaxCharges: charges, postTaxCharges: [] };
}

/** Per-line factor = still-active qty share (net of approved short close), mirroring netTaxableAmount. */
async function activeQtyFactor(row, transaction) {
	const qty = Number(row.qty || 0);
	if (!qty) return 1;
	const shortClosedQty = Number(
		await shortCloseRequestItemsRepository.sumApprovedQtyForPoWoItem(row.id, { transaction }),
	);
	if (!shortClosedQty) return 1;
	return Math.max(qty - shortClosedQty, 0) / qty;
}

/** Budget components (per budget_id) of one persisted PO/WO. */
async function componentsForStoredDocument(documentType, doc, { transaction, netOfShortClose = true } = {}) {
	const config = DOC_CONFIG[documentType];
	const items = doc[config.itemsAs] || (await config.itemModel.findAll({ where: { [config.itemParentKey]: doc.id }, transaction }));
	const totals = await storedDocumentTotals(documentType, doc, items, transaction);
	const lines = await Promise.all(
		items.map(async (row) => ({
			budget_id: row.budget_id,
			factor: netOfShortClose ? await activeQtyFactor(row, transaction) : 1,
		})),
	);
	return computeDocumentBudgetComponents(totals, lines);
}

// ---------------------------------------------------------------------------------------
// Purchase Invoice layer. An invoice is the *actual* for its PO/WO: per document, budget
// consumption = max(PO/WO commitment, Σ approved invoice impact). So a partial invoice never
// double-counts against its order, but anything an invoice adds beyond the order — e.g. freight
// that was never on the PO — does consume budget, and later PO/WO checks see it too.
// ---------------------------------------------------------------------------------------

// Only an approved invoice is an actual; draft/in_progress ones are checked at their own approval.
const INVOICE_ACTUAL_STATUSES = ['approved'];
// Draft/in_progress invoices still claim charges for the charge-variance comparison.
const INVOICE_LIVE_STATUSES = ['draft', 'in_progress', 'approved'];

const rowTax = (row) => Number(row.igst || 0) + Number(row.cgst || 0) + Number(row.sgst || 0);

/**
 * Budget components (per budget_id) of one persisted Purchase Invoice. Lines map to budgets
 * through their PO/WO line's budget_id; every invoice charge counts (PI charges carry no
 * budget_impact flag — they are exactly the net-new spend this layer exists to catch).
 */
async function componentsForInvoice(invoice, { transaction } = {}) {
	const config = DOC_CONFIG[invoice.document_type];
	const items =
		invoice.items || (await PurchaseInvoiceItem.findAll({ where: { purchase_invoice_id: invoice.id }, transaction }));
	const charges =
		invoice.charges ||
		(await PurchaseInvoiceCharge.findAll({ where: { purchase_invoice_id: invoice.id }, transaction }));

	const docItems = items.length
		? await config.itemModel.findAll({
				where: { id: items.map((i) => i.po_wo_item_id) },
				attributes: ['id', 'budget_id'],
				transaction,
			})
		: [];
	const budgetByDocItem = new Map(docItems.map((d) => [d.id, d.budget_id]));

	const totals = {
		items: items.map((row) => ({
			taxableAmount: taxableAmountOf(row),
			taxAmount: rowTax(row),
			cess: Number(row.cess || 0),
		})),
		preTaxCharges: charges.map((c) => ({
			amount: Number(c.total || 0) - rowTax(c) - Number(c.cess || 0),
			tax: rowTax(c) + Number(c.cess || 0),
		})),
		postTaxCharges: [],
	};
	return computeDocumentBudgetComponents(
		totals,
		items.map((row) => ({ budget_id: budgetByDocItem.get(row.po_wo_item_id) ?? null })),
	);
}

/** Σ budget impact of a PO/WO's approved invoices against one budget. */
async function getInvoicedBudgetImpact({ documentType, documentId, budget, excludeInvoiceId, transaction }) {
	const config = DOC_CONFIG[documentType];
	const invoices = await PurchaseInvoice.findAll({
		where: {
			document_type: documentType,
			[config.invoiceParentKey]: documentId,
			status: { [Op.in]: INVOICE_ACTUAL_STATUSES },
			...(excludeInvoiceId ? { id: { [Op.ne]: excludeInvoiceId } } : {}),
		},
		attributes: ['id', 'document_type'],
		transaction,
	});
	let total = 0;
	for (const inv of invoices) {
		const components = await componentsForInvoice(inv, { transaction });
		total += budgetImpactOf(components.get(Number(budget.id)), budget.tax_budget_impact);
	}
	return round2(total);
}

/** A PO/WO's own commitment against one budget (net of approved short close). */
async function documentCommitmentImpact({ documentType, documentId, budget, transaction }) {
	const config = DOC_CONFIG[documentType];
	const doc = await config.model.findOne({
		where: { id: documentId },
		attributes: ['id', 'customFields', 'same_state'],
		transaction,
	});
	if (!doc) return 0;
	const allItems = await config.itemModel.findAll({ where: { [config.itemParentKey]: doc.id }, transaction });
	const components = await componentsForStoredDocument(
		documentType,
		{ id: doc.id, customFields: doc.customFields, same_state: doc.same_state, [config.itemsAs]: allItems },
		{ transaction },
	);
	return budgetImpactOf(components.get(Number(budget.id)), budget.tax_budget_impact);
}

/**
 * Σ budget consumption of every committed PO + WO against one budget — each document counted
 * at max(its own commitment, its approved invoices' impact) — optionally excluding the document
 * currently being validated (so its own pre-edit/pre-submit rows never double-count).
 */
async function getCommittedBudgetImpact({ budget, excludeDocumentType, excludeDocumentId, transaction }) {
	let total = 0;
	const breakdown = [];

	for (const [documentType, config] of Object.entries(DOC_CONFIG)) {
		const where = { ...config.committedWhere };
		if (excludeDocumentType === documentType && excludeDocumentId) {
			where.id = { [Op.ne]: excludeDocumentId };
		}
		const docs = await config.model.findAll({
			where,
			include: [
				{
					model: config.itemModel,
					as: config.itemsAs,
					required: true,
					// Only picks documents touching this budget; componentsForStoredDocument then
					// reloads ALL of each document's lines so charge shares split correctly.
					where: { budget_id: budget.id },
					attributes: ['id'],
				},
			],
			attributes: ['id', 'customFields', 'same_state', 'doc_number'],
			transaction,
		});

		for (const doc of docs) {
			const allItems = await config.itemModel.findAll({ where: { [config.itemParentKey]: doc.id }, transaction });
			const components = await componentsForStoredDocument(
				documentType,
				{ id: doc.id, customFields: doc.customFields, same_state: doc.same_state, [config.itemsAs]: allItems },
				{ transaction },
			);
			const commitment = budgetImpactOf(components.get(Number(budget.id)), budget.tax_budget_impact);
			const invoiced = await getInvoicedBudgetImpact({ documentType, documentId: doc.id, budget, transaction });
			const impact = Math.max(commitment, invoiced);
			if (!impact) continue;
			total += impact;
			breakdown.push({
				document_type: documentType,
				document_id: doc.id,
				doc_number: doc.doc_number,
				impact: round2(impact),
				committed: commitment,
				invoiced,
			});
		}
	}

	return { committed: round2(total), breakdown };
}

/**
 * Purchase Invoice budget check. For every budget the invoice touches: consumption of all OTHER
 * committed documents + this invoice's PO/WO at max(commitment, approved invoices + this
 * invoice) must stay within the effective limit.
 *
 * @param {boolean} enforce - true at approval (Budget rows locked, throws); false at create
 *   (advisory, returns violations for `budget_warnings`).
 */
async function validateInvoiceBudget({ invoice, enforce, transaction }) {
	const documentType = invoice.document_type;
	const documentId = documentType === 'work_order' ? invoice.work_order_id : invoice.purchase_order_id;
	const components = await componentsForInvoice(invoice, { transaction });
	if (components.size === 0) return [];

	const violations = [];
	for (const budgetId of [...components.keys()].sort((a, b) => a - b)) {
		const budget = await Budget.findOne({
			where: { id: budgetId },
			transaction,
			...(enforce && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
		});
		if (!budget) continue;

		const thisInvoice = budgetImpactOf(components.get(budgetId), budget.tax_budget_impact);
		const [{ committed: others }, commitment, invoicedBefore] = await Promise.all([
			getCommittedBudgetImpact({ budget, excludeDocumentType: documentType, excludeDocumentId: documentId, transaction }),
			documentCommitmentImpact({ documentType, documentId, budget, transaction }),
			getInvoicedBudgetImpact({ documentType, documentId, budget, excludeInvoiceId: invoice.id, transaction }),
		]);
		const docConsumption = Math.max(commitment, round2(invoicedBefore + thisInvoice));
		const limit = effectiveCommitmentLimit(budget);
		const excess = round2(others + docConsumption - limit);

		if (excess > 0) {
			violations.push({
				budget_id: budget.id,
				budget_no: budget.budget_id,
				commitment_limit: limit,
				committed: round2(others + commitment),
				available: round2(limit - others - commitment),
				requested: thisInvoice,
				excess,
				message:
					`Budget ${budget.budget_id} limit exceeded by this Purchase Invoice. ` +
					`Limit: ${limit.toFixed(2)}, Committed by other documents: ${others.toFixed(2)}, ` +
					`This ${DOC_CONFIG[documentType].label}: ${commitment.toFixed(2)} committed / ` +
					`${round2(invoicedBefore + thisInvoice).toFixed(2)} invoiced incl. this invoice (${thisInvoice.toFixed(2)}), ` +
					// BUDGET_REVISION_DISABLED: revision hint hidden for now —
					// `Excess: ${excess.toFixed(2)}. Raise a Budget Revision of at least ${excess.toFixed(2)} to proceed.`,
					`Excess: ${excess.toFixed(2)}.`,
			});
		}
	}

	if (enforce && violations.length) {
		throw new AppError(violations.map((v) => v.message).join(' '), StatusCodes.BAD_REQUEST);
	}
	return violations;
}

/**
 * Charge-variance check for a new invoice: Σ charges (amount + tax) of this PO/WO's live
 * invoices, including the one being created, vs the PO/WO's own charges. Returns details when
 * the invoices exceed the order's charges by more than `tolerancePct`, else null.
 */
async function getInvoiceChargeVariance({ documentType, documentId, newChargesTotal, tolerancePct, transaction }) {
	const config = DOC_CONFIG[documentType];
	const doc = await config.model.findOne({ where: { id: documentId }, transaction });
	if (!doc) return null;
	const items = await config.itemModel.findAll({ where: { [config.itemParentKey]: doc.id }, transaction });
	const orderTotals = await storedDocumentTotals(documentType, doc, items, transaction);
	const orderCharges = round2(
		[...orderTotals.preTaxCharges, ...orderTotals.postTaxCharges].reduce(
			(sum, c) => sum + Number(c.amount || 0) + Number(c.tax || 0),
			0,
		),
	);

	const priorInvoiced = Number(
		(await PurchaseInvoiceCharge.sum('total', {
			include: [
				{
					model: PurchaseInvoice,
					as: 'purchaseInvoice',
					attributes: [],
					required: true,
					where: {
						document_type: documentType,
						[config.invoiceParentKey]: documentId,
						status: { [Op.in]: INVOICE_LIVE_STATUSES },
					},
				},
			],
			transaction,
		})) || 0,
	);
	const invoicedCharges = round2(priorInvoiced + Number(newChargesTotal || 0));
	const allowed = round2(orderCharges * (1 + tolerancePct / 100));
	if (invoicedCharges <= allowed + 0.01) return null;
	return { orderCharges, invoicedCharges, excess: round2(invoicedCharges - orderCharges) };
}

/**
 * Validates one document's budget components against each touched budget's remaining
 * commitment headroom.
 *
 * @param {Map<number, object>} components - from computeDocumentBudgetComponents /
 *   componentsForStoredDocument.
 * @param {boolean} enforce - true at a real commitment point (PO submit, WO final approval,
 *   editing an already-committed document): Budget rows are locked FOR UPDATE, in id order, and
 *   a violation throws. false (draft saves): no lock, violations are only returned as warnings.
 * @returns {Promise<object[]>} violations
 */
async function validateBudgetCommitment({
	components,
	documentType,
	excludeDocumentId,
	documentLabel,
	enforce,
	transaction,
}) {
	if (!components || components.size === 0) return [];

	const violations = [];
	const budgetIds = [...components.keys()].sort((a, b) => a - b);

	for (const budgetId of budgetIds) {
		const budget = await Budget.findOne({
			where: { id: budgetId },
			transaction,
			...(enforce && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
		});
		if (!budget) continue;

		const requested = budgetImpactOf(components.get(budgetId), budget.tax_budget_impact);
		const { committed } = await getCommittedBudgetImpact({
			budget,
			excludeDocumentType: documentType,
			excludeDocumentId,
			transaction,
		});
		const limit = effectiveCommitmentLimit(budget);
		const available = round2(limit - committed);
		const excess = round2(requested - available);

		if (excess > 0) {
			violations.push({
				budget_id: budget.id,
				budget_no: budget.budget_id,
				commitment_limit: limit,
				committed,
				available,
				requested,
				excess,
				message:
					`Budget ${budget.budget_id} commitment limit exceeded. ` +
					`Limit: ${limit.toFixed(2)} (Base ${Number(budget.amount || 0).toFixed(2)}, ` +
					`Provision ${Number(budget.provision_amount || 0).toFixed(2)}), ` +
					// BUDGET_REVISION_DISABLED: `Approved Revisions ${Number(budget.revised_amount || 0).toFixed(2)}), ` +
					`Already Committed: ${committed.toFixed(2)}, Available: ${available.toFixed(2)}, ` +
					`Budget Impact${documentLabel ? ` of ${documentLabel}` : ''}: ${requested.toFixed(2)}, ` +
					// BUDGET_REVISION_DISABLED: revision hint hidden for now —
					// `Excess: ${excess.toFixed(2)}. Raise a Budget Revision of at least ${excess.toFixed(2)} to proceed.`,
					`Excess: ${excess.toFixed(2)}.`,
			});
		}
	}

	if (enforce && violations.length) {
		throw new AppError(violations.map((v) => v.message).join(' '), StatusCodes.BAD_REQUEST);
	}
	return violations;
}

/** Puts advisory violations on a create/update response as `budget_warnings`. */
function attachBudgetWarnings(doc, warnings) {
	if (!doc) return;
	if (typeof doc.setDataValue === 'function') doc.setDataValue('budget_warnings', warnings);
	else doc.budget_warnings = warnings;
}

module.exports = {
	attachBudgetWarnings,
	validateIndentLineBudget,
	validateDocumentAgainstIndentBudget,
	taxableAmountOf,
	componentsForStoredDocument,
	getCommittedBudgetImpact,
	validateBudgetCommitment,
	validateInvoiceBudget,
	getInvoiceChargeVariance,
	computeDocumentBudgetComponents,
};
