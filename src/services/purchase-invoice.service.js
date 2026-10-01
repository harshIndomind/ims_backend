/**
 * Purchase Invoice — the vendor's bill against a PO or WO, sitting between
 * MRN/QC and Payment Requisition. Does a 3-way match (ordered vs
 * received/accepted vs vendor-billed) so Payment Requisition stops trusting
 * the order's full ordered value regardless of what actually arrived.
 *
 * PO/WO polymorphic (DOC_CONFIG below), mirroring qc-inspection.service.js /
 * short-close.service.js's own document_type + DOC_CONFIG pattern. The two
 * document types have genuinely different ceilings, though, because they have
 * different receipt-tracking data available:
 *  - purchase_order: always MRN received_qty (GoodsReceiptNote/Item) — MRN
 *    itself already internally respects po_qc_check (gates on QC only when
 *    the PO requires it), so this one ceiling is correct regardless of
 *    whether QC was involved.
 *  - work_order: Work Orders have no MRN-equivalent receipt ledger at all in
 *    this codebase. The ceiling is QC accepted_qty when the WO requires QC
 *    (wo_qc_check), or the WO item's own ordered qty directly when it
 *    doesn't — the closest honest ceiling given there's nothing else to check
 *    a WO line against. See getCeilingQtyForItem.
 *
 * Matching rules (locked with the user, see project memory
 * purchase_invoice_module_design):
 *  - Quantity: HARD block, no override. Σ invoiced_qty across all live
 *    invoices for a line can never exceed its ceiling (see above) — mirrors
 *    GRN's own hard cap at QC accepted_qty.
 *  - Price/tax: SOFT flag. A line whose price differs from the order item's
 *    own price by more than PRICE_VARIANCE_TOLERANCE_PCT is still
 *    submittable, just marked matching_status='variance_flagged' (rolled up
 *    to the header) for the approver to see and note, not blocked.
 *
 * Storage mirrors short-close/QC: nothing derived is stored on the order item
 * itself — "already invoiced qty" is always summed live via
 * purchaseInvoiceItemsRepository.sumInvoicedQtyForPoWoItem, the same pattern
 * QC's accepted_qty and short-close's short_closed_qty already use.
 */
const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { Op } = require('sequelize');
const { sequelize } = require('../models/index');
const {
	PurchaseOrder,
	PurchaseOrderItem,
	WorkOrder,
	WorkOrderItem,
	PurchaseInvoice,
	PurchaseInvoiceItem,
	PurchaseInvoiceCharge,
	MasterOtherChargeType,
	QcInspection,
	QcInspectionItem,
	GoodsReceiptNote,
	GoodsReceiptNoteItem,
	PaymentRequisition,
	PaymentRequisitionDeduction,
} = require('../models/index');
const { purchaseInvoiceItemsRepository, qcInspectionItemsRepository } = require('../repository/index');
const { getReceivedQtyForPoItem } = require('./grn.service');
const workflowEngine = require('./workflowEngine.service');
const auditLogService = require('./auditLog.service');
const { createWorkflowDocumentService } = require('./workflowDocument.factory');
const { calculateDocumentTotals } = require('../utils/charge-tax-engine.util');
const { round2 } = require('../utils/money');
const { fetchProductGroupsByIds } = require('../utils/vcpProductGroups');
const {
	validateInvoiceBudget,
	getInvoiceChargeVariance,
	attachBudgetWarnings,
} = require('./budget-validation.service');

const DOCUMENT_TYPE = 'purchase_invoice';

// No config table for this exists elsewhere in the codebase (checked
// payment-requisition's own deduction/retention config, which is all
// per-PO/hardcoded too) — a plain constant matches the codebase's existing
// preference for simple constants over premature configurability.
const PRICE_VARIANCE_TOLERANCE_PCT = 2;

// "Live" = still counts against the line's received/accepted-qty ceiling —
// draft and in_progress invoices hold their claimed qty just as much as an
// approved one does, so two invoices being drafted concurrently against the
// same line still see each other. Only rejected/cancelled invoices never
// happened as far as the order's fulfillment math is concerned. Matches
// purchaseInvoiceItems.repository.js's own LIVE_STATUSES.
const LIVE_STATUSES = ['draft', 'in_progress', 'approved'];

const OPEN_STATUSES = ['draft', 'in_progress'];

// document_type values match qc-inspection.service.js's DOC_CONFIG exactly
// (purchase_order / work_order).
const DOC_CONFIG = {
	purchase_order: { model: PurchaseOrder, itemModel: PurchaseOrderItem, label: 'Purchase Order' },
	work_order: { model: WorkOrder, itemModel: WorkOrderItem, label: 'Work Order' },
};

function resolveDocConfig(documentType) {
	const config = DOC_CONFIG[documentType];
	if (!config) {
		throw new AppError(`Unsupported document_type "${documentType}"`, StatusCodes.BAD_REQUEST);
	}
	return config;
}

// The ceiling a line's invoiced_qty is hard-blocked against — see the file
// header for why PO and WO resolve this differently.
async function getCeilingQtyForItem(documentType, doc, item, options = {}) {
	if (documentType === 'purchase_order') {
		return getReceivedQtyForPoItem(item.id, options);
	}
	if (doc.wo_qc_check) {
		return qcInspectionItemsRepository.sumAcceptedQtyForPoWoItem(item.id, options);
	}
	return parseFloat(item.qty) || 0;
}

function actorSnapshot(user) {
	return user ? { id: user.id, name: user.name, email: user.email } : null;
}

async function fetchInvoiceOrThrow(id) {
	const invoice = await PurchaseInvoice.findOne({
		where: { id },
		include: [
			{ model: PurchaseInvoiceItem, as: 'items' },
			{
				model: PurchaseInvoiceCharge,
				as: 'charges',
				include: [{ model: MasterOtherChargeType, as: 'chargeType' }],
			},
			// payment_term_id and the item-level budget_id/budget_no are sideloaded
			// here so Payment Requisition's Invoice-mode create/edit flow can
			// auto-fill Term & Condition / Budget / Cost Center the same way it
			// already does for a direct PO/WO selection (see
			// payment-requisition-form.tsx) — an Invoice-anchored requisition still
			// inherits its underlying PO/WO's budget and payment-term context, it
			// just wasn't reachable before.
			{
				model: PurchaseOrder,
				as: 'purchaseOrder',
				attributes: ['id', 'doc_number', 'poPrefix', 'poNo', 'poPostfix', 'payment_term_id'],
				include: [{ model: PurchaseOrderItem, as: 'items', attributes: ['id', 'budget_id', 'budget_no'] }],
			},
			{
				model: WorkOrder,
				as: 'workOrder',
				attributes: ['id', 'doc_number', 'woPrefix', 'woNo', 'woPostfix', 'payment_term_id'],
				include: [{ model: WorkOrderItem, as: 'items', attributes: ['id', 'budget_id', 'budget_no'] }],
			},
			// Sideloaded purely so the frontend can show "MRN/QC Created On" in
			// view mode — the invoice's own qty matching never reads these,
			// only document_type + purchase_order_id/work_order_id.
			{
				model: GoodsReceiptNote,
				as: 'mrn',
				attributes: ['id', 'grnPrefix', 'grnNo', 'grnPostfix', 'createdAt'],
			},
			{
				model: QcInspection,
				as: 'qcInspection',
				attributes: ['id', 'qc_no', 'createdAt'],
			},
		],
	});
	if (!invoice) {
		throw new AppError(`Purchase Invoice with ID ${id} not found`, StatusCodes.NOT_FOUND);
	}
	return invoice;
}

const piWorkflow = createWorkflowDocumentService({
	documentType: DOCUMENT_TYPE,
	fetchById: (id) => fetchInvoiceOrThrow(id),
});

exports.generateInvoiceNumber = async (req) => {
	const { org_id } = req.user;
	const latest = await PurchaseInvoice.findOne({ where: { org_id }, order: [['createdAt', 'DESC']] });
	let next = 1;
	if (latest) {
		const latestNumber = parseInt(latest.invoiceNo, 10);
		if (!isNaN(latestNumber)) next = latestNumber + 1;
	}
	return next.toString().padStart(4, '0');
};

// Drives the create page's item table. Deliberately its own fetch, NOT a
// reuse of QC's /remaining or short-close's /short-closeable-items — both of
// those key off QC accepted_qty, which is pre-MRN and the wrong ceiling for a
// PO line (see getCeilingQtyForItem for why WO differs).
exports.getInvoiceableItems = async (req, { document_type, document_id }) => {
	const { org_id } = req.user;
	const config = resolveDocConfig(document_type);
	const doc = await config.model.findOne({
		where: { id: document_id, org_id },
		include: [{ model: config.itemModel, as: 'items' }],
	});
	if (!doc) throw new AppError(`${config.label} not found`, StatusCodes.NOT_FOUND);

	// Fetched once for the whole document, not per-item, then attached below — same
	// approach qc-inspection.service.js uses for its own item list.
	const productGroupsMap = await fetchProductGroupsByIds(req, doc.items.map((item) => item.product_id));

	const items = await Promise.all(
		doc.items.map(async (item) => {
			const [receivedQty, alreadyInvoicedQty] = await Promise.all([
				getCeilingQtyForItem(document_type, doc, item),
				purchaseInvoiceItemsRepository.sumInvoicedQtyForPoWoItem(item.id),
			]);
			return {
				po_wo_item_id: item.id,
				product_id: item.product_id,
				productSnapshot: item.productSnapshot ?? null,
				product_groups: productGroupsMap.get(item.product_id) || [],
				// Drives whether the create form even shows a Batch/Serial column
				// for this row — the actual received batch/serial values come from
				// whichever MRN/QC the line was scoped to (resolved client-side,
				// see purchase-invoice-form.tsx), not from here.
				stock_type: item.stock_type ?? 'normal',
				ordered_qty: parseFloat(item.qty) || 0,
				po_price: parseFloat(item.price) || 0,
				// Order item's own discount/tax/UOM — the create form defaults a new
				// invoice line to these (same convention as po_price), same UI/inputs
				// as the PO's own line-item row (discount input, GST-rate dropdown,
				// UOM display), all still editable since the vendor bill can differ.
				discount: parseFloat(item.discount) || 0,
				discount_price_type: item.discount_price_type || 'percentage',
				uomDisplay:
					item.uomSnapshot?.unit?.name ||
					item.uomSnapshot?.unit?.code ||
					item.productSnapshot?.baseUnit?.name ||
					item.productSnapshot?.baseUnit?.code ||
					'N/A',
				// Order item's own tax breakdown (absolute, for its full ordered_qty)
				// and tax reference — the UI uses these to pre-select the same GST
				// rate by default, so an unedited line doesn't spuriously soft-flag.
				tax_id: item.tax_id ?? null,
				taxSnapshot: item.taxSnapshot ?? null,
				po_item_igst: parseFloat(item.igst) || 0,
				po_item_cgst: parseFloat(item.cgst) || 0,
				po_item_sgst: parseFloat(item.sgst) || 0,
				po_item_cess: parseFloat(item.cess) || 0,
				received_qty: receivedQty,
				already_invoiced_qty: alreadyInvoicedQty,
				remaining_invoiceable_qty: Math.max(0, receivedQty - alreadyInvoicedQty),
			};
		}),
	);

	return {
		document_type,
		document_id: doc.id,
		// Drives the CGST+SGST vs IGST split in the create form's GST-rate
		// dropdown, same as PO/WO's own line-item tax column.
		same_state: Boolean(doc.same_state),
		can_create_invoice: items.some((i) => i.remaining_invoiceable_qty > 0),
		items,
	};
};

// The Purchase Invoice create form's PO/WO, QC, and MRN dropdowns must stop
// offering a document once nothing more can ever be invoiced against it —
// otherwise a fully-billed PO stays selectable forever. "Exhausted" is
// deliberately stricter than remaining_invoiceable_qty === 0: it also
// requires the item's ceiling (received/accepted qty) to have reached its
// ordered qty, i.e. nothing further will ever arrive via a future MRN/QC
// round. A freshly-approved PO with nothing received yet has
// remaining_invoiceable_qty === 0 too (0 − 0), but must NOT be hidden — only
// a line that's both fully delivered and fully billed is truly done.
// QC/MRN items reference po_wo_item_id/purchase_order_item_id directly (see
// QcInspectionItem/GoodsReceiptNoteItem), so a QC or MRN is hidden once every
// item it touches is exhausted — it cannot unlock any further invoiceable qty.
// PO/WO status includes 'completed' alongside 'approved' — a document short-closed to zero
// remaining_qty flips to 'completed' (short-close.service.js's maybeCompleteDocument) even
// though its already-accepted-but-not-yet-invoiced qty can still be legitimately billed.
// Scanning only 'approved' here would leave such a document out of `itemExhausted`/
// `docExhausted` forever, so once the create form's dropdown (which must also accept
// 'completed', see purchase-invoice-form.tsx) starts offering it, it would never get hidden
// again even after being fully invoiced.
const INVOICEABLE_DOC_STATUSES = ['approved', 'completed'];

exports.getExhaustedLookupIds = async (req, { document_type }) => {
	const { org_id } = req.user;
	const config = resolveDocConfig(document_type);

	const docs = await config.model.findAll({
		where: { org_id, status: { [Op.in]: INVOICEABLE_DOC_STATUSES } },
		include: [{ model: config.itemModel, as: 'items' }],
	});

	// po_wo_item_id -> exhausted. Only populated for items belonging to an
	// approved doc fetched above — a QC/MRN item pointing at anything else
	// (e.g. its parent PO/WO is no longer 'approved') falls back to "not
	// exhausted" below, the safe default that keeps it visible.
	const itemExhausted = new Map();
	const docExhausted = new Set();

	await Promise.all(
		docs.map(async (doc) => {
			const results = await Promise.all(
				doc.items.map(async (item) => {
					const [ceilingQty, invoicedQty] = await Promise.all([
						getCeilingQtyForItem(document_type, doc, item),
						purchaseInvoiceItemsRepository.sumInvoicedQtyForPoWoItem(item.id),
					]);
					const orderedQty = parseFloat(item.qty) || 0;
					const exhausted = ceilingQty >= orderedQty - 0.001 && invoicedQty >= ceilingQty - 0.001;
					itemExhausted.set(item.id, exhausted);
					return exhausted;
				}),
			);
			if (results.length > 0 && results.every(Boolean)) docExhausted.add(doc.id);
		}),
	);

	const qcInspections = await QcInspection.findAll({
		where: { org_id, document_type, status: 'approved' },
		include: [{ model: QcInspectionItem, as: 'items', attributes: ['id', 'po_wo_item_id'] }],
	});
	const qcExhaustedIds = qcInspections
		.filter((qc) => qc.items.length > 0 && qc.items.every((item) => itemExhausted.get(item.po_wo_item_id) === true))
		.map((qc) => qc.id);

	let mrnExhaustedIds = [];
	if (document_type === 'purchase_order') {
		const grns = await GoodsReceiptNote.findAll({
			where: { org_id, status: 'active' },
			include: [{ model: GoodsReceiptNoteItem, as: 'items', attributes: ['id', 'purchase_order_item_id'] }],
		});
		mrnExhaustedIds = grns
			.filter(
				(grn) =>
					grn.items.length > 0 &&
					grn.items.every((item) => itemExhausted.get(item.purchase_order_item_id) === true),
			)
			.map((grn) => grn.id);
	}

	return {
		document_type,
		document_ids: Array.from(docExhausted),
		qc_ids: qcExhaustedIds,
		mrn_ids: mrnExhaustedIds,
	};
};

exports.createPurchaseInvoice = async (req, body) => {
	const { org_id } = req.user;
	const {
		document_type,
		document_id,
		mrn_id = null,
		qc_id = null,
		invoiceDetail = {},
		vendor_invoice_no,
		vendor_invoice_date,
		invoice_date,
		remarks,
		items,
		other_charges = [],
		isRoundOff = false,
	} = body;

	if (!Array.isArray(items) || items.length === 0) {
		throw new AppError('At least one item is required', StatusCodes.BAD_REQUEST);
	}

	const config = resolveDocConfig(document_type);
	const doc = await config.model.findOne({
		where: { id: document_id, org_id },
		include: [{ model: config.itemModel, as: 'items' }],
	});
	if (!doc) throw new AppError(`${config.label} not found`, StatusCodes.NOT_FOUND);

	// Display-only traceability, not a matching input — still verified to
	// actually belong to this document so the header never ends up pointing
	// at an MRN/QC from an unrelated PO/WO.
	let mrn = null;
	if (mrn_id && document_type === 'purchase_order') {
		mrn = await GoodsReceiptNote.findOne({ where: { id: mrn_id, purchase_order_id: doc.id } });
		if (!mrn) throw new AppError('Selected MRN does not belong to this Purchase Order', StatusCodes.BAD_REQUEST);
	}
	let qcInspection = null;
	if (qc_id) {
		qcInspection = await QcInspection.findOne({ where: { id: qc_id, document_type, document_id: doc.id } });
		if (!qcInspection) throw new AppError(`Selected QC does not belong to this ${config.label}`, StatusCodes.BAD_REQUEST);
	}

	// Vendor invoice dates against the same order must move forward — a
	// backdated bill arriving after a later one was already recorded would
	// have to be booked in an accounting period that's already closed off by
	// the later invoice, which the rest of the system (matching, payment
	// requisition) doesn't know how to unwind. Only live invoices count:
	// a rejected/cancelled one's date never happened as far as the order's
	// billing timeline is concerned.
	const latestInvoice = await PurchaseInvoice.findOne({
		where: {
			document_type,
			[document_type === 'work_order' ? 'work_order_id' : 'purchase_order_id']: doc.id,
			status: { [Op.in]: LIVE_STATUSES },
		},
		order: [['vendor_invoice_date', 'DESC']],
		attributes: ['id', 'vendor_invoice_date'],
	});
	if (latestInvoice && new Date(vendor_invoice_date) < new Date(latestInvoice.vendor_invoice_date)) {
		throw new AppError(
			`Vendor invoice date cannot be earlier than ${new Date(latestInvoice.vendor_invoice_date).toLocaleDateString('en-IN')}, the date of the latest invoice already recorded against this ${config.label}`,
			StatusCodes.BAD_REQUEST,
		);
	}

	const docItemsById = new Map(doc.items.map((i) => [i.id, i]));
	const preparedItems = [];
	let anyVariance = false;

	for (const line of items) {
		const docItem = docItemsById.get(Number(line.po_wo_item_id));
		if (!docItem) {
			throw new AppError(`Item ${line.po_wo_item_id} does not belong to this ${config.label}`, StatusCodes.BAD_REQUEST);
		}

		const invoicedQty = parseFloat(line.invoiced_qty);
		if (!(invoicedQty > 0)) {
			throw new AppError('invoiced_qty must be greater than 0', StatusCodes.BAD_REQUEST);
		}
		const price = parseFloat(line.price);
		if (isNaN(price) || price < 0) {
			throw new AppError('price is required for each item', StatusCodes.BAD_REQUEST);
		}

		// Hard block — no override. Mirrors GRN's own hard cap at QC accepted_qty.
		const [receivedQty, alreadyInvoicedQty] = await Promise.all([
			getCeilingQtyForItem(document_type, doc, docItem),
			purchaseInvoiceItemsRepository.sumInvoicedQtyForPoWoItem(docItem.id),
		]);
		const remainingInvoiceable = Math.max(0, receivedQty - alreadyInvoicedQty);
		if (invoicedQty > remainingInvoiceable + 0.001) {
			throw new AppError(
				`Cannot invoice ${invoicedQty} for "${docItem.productSnapshot?.name || `item ${docItem.id}`}" — only ${remainingInvoiceable} remaining against received/accepted qty of ${receivedQty}`,
				StatusCodes.UNPROCESSABLE_ENTITY,
			);
		}

		// Soft flag — submittable either way, just surfaced for the approver.
		const orderPrice = parseFloat(docItem.price) || 0;
		const priceVariancePct = orderPrice > 0 ? ((price - orderPrice) / orderPrice) * 100 : 0;
		// Compares the tax RATE/reference, not absolute igst/cgst/sgst amounts —
		// docItem's amounts are for its full ordered_qty while line's are for
		// whatever (usually partial) qty is actually being invoiced, so comparing
		// the two absolute amounts directly would flag every partial invoice as a
		// tax variance even when the rate is identical.
		const taxVarianceFlag = String(line.tax_id ?? '') !== String(docItem.tax_id ?? '');
		const lineVariance = Math.abs(priceVariancePct) > PRICE_VARIANCE_TOLERANCE_PCT || taxVarianceFlag;
		if (lineVariance) anyVariance = true;

		preparedItems.push({
			po_wo_item_id: docItem.id,
			product_id: docItem.product_id,
			productSnapshot: docItem.productSnapshot ?? null,
			uomSnapshot: docItem.uomSnapshot ?? null,
			// Resolved client-side from whichever MRN (PO) or QC (WO) the line was
			// scoped to — the only place the actually-received batch/serial lives,
			// see purchase-invoice-form.tsx. null/absent when the invoice wasn't
			// scoped to a single MRN/QC (spans several, so the batch is ambiguous)
			// or the item is stock_type 'normal'.
			stock_type: line.stock_type || docItem.stock_type || null,
			batchSnapshot: line.batchSnapshot || null,
			serial_nos: line.serial_nos || null,
			invoiced_qty: invoicedQty,
			price,
			discount: parseFloat(line.discount || 0),
			discount_price_type: line.discount_price_type || null,
			tax_id: line.tax_id || null,
			taxSnapshot: line.taxSnapshot || null,
			// igst/cgst/sgst/cess/total are placeholders here — overwritten below from
			// charge-tax-engine.util.js's calculateDocumentTotals, which is now the
			// authoritative source (client-sent values were never recomputed before this,
			// same gap PO/WO had). cess carries through as originally supplied since the
			// engine (like PO/WO) never derives cess from a rate, only passes it along.
			igst: 0,
			cgst: 0,
			sgst: 0,
			cess: parseFloat(line.cess || 0),
			total: 0,
			po_item_price_snapshot: orderPrice,
			price_variance_pct: priceVariancePct,
			tax_variance_flag: taxVarianceFlag,
			matching_status: lineVariance ? 'variance_flagged' : 'matched',
			remarks: line.remarks || null,
		});
	}

	// Other charges (freight, loading/unloading, etc.) — additive on top of the
	// matched items, never subject to the qty hard-block or price/tax variance
	// check above: there's no order baseline for them to be matched against in
	// the first place, they're net-new spend introduced at billing time.
	// Approval (human review) is the only control on these.
	//
	// Payload shape is now the same generic Charge the shared <ChargesTable> component
	// sends for PO/WO (name/calculationType/value/operation/applyOn/taxTreatment/
	// taxRate) instead of PI's old charge_type_id/description/charge_basis/value_type/
	// tax_id/taxSnapshot shape — see the migration/model comments on
	// purchaseinvoicecharge.js for why tax_treatment/tax_rate were added rather than
	// reusing tax_id (the old master-tax-record lookup has no equivalent in the generic
	// model, which only ever collects a raw rate number). charge_type_id/tax_id/
	// taxSnapshot are left null going forward — old rows keep whatever they had.
	const VALID_TAX_TREATMENTS = ['NON_TAXABLE', 'SPECIFIC_RATE', 'INHERIT_ITEM_TAX'];
	const preparedCharges = [];
	for (const charge of other_charges) {
		const value = parseFloat(charge.value);
		if (isNaN(value) || value < 0) {
			throw new AppError('Each other charge requires a valid amount', StatusCodes.BAD_REQUEST);
		}
		if (!(charge.name || '').trim()) {
			throw new AppError('Each other charge requires a name', StatusCodes.BAD_REQUEST);
		}
		const taxTreatment = VALID_TAX_TREATMENTS.includes(charge.taxTreatment) ? charge.taxTreatment : 'NON_TAXABLE';
		preparedCharges.push({
			charge_type_id: null,
			description: charge.name,
			amount: value,
			tax_id: null,
			taxSnapshot: null,
			// Placeholders — overwritten below from the shared engine. cess has no
			// engine-side charge concept (same as PO/WO's document_charges), always 0.
			igst: 0,
			cgst: 0,
			sgst: 0,
			cess: 0,
			total: 0,
			charge_basis: charge.applyOn === 'AFTER_TAX' ? 'post_tax' : 'pre_tax',
			value_type: charge.calculationType === 'PERCENTAGE' ? 'percentage' : 'rupee',
			operation_type: charge.operation === '-' ? '-' : '+',
			tax_treatment: taxTreatment,
			tax_rate: taxTreatment === 'SPECIFIC_RATE' ? parseFloat(charge.taxRate) || 0 : null,
			remarks: charge.remarks || null,
		});
	}

	// Backend is the source of truth for persisted financial totals — see
	// charge-tax-engine.util.js and purchase-order.service.js/work-order.service.js's
	// identical convention. `amount` on a charge is always the raw, unsigned entered
	// number regardless of value_type (see PurchaseInvoiceCharge's own field comment) —
	// a percentage charge's `amount` is the percentage number itself, not a pre-resolved
	// rupee figure, so value_type maps directly to the engine's calculationType and the
	// engine does the FIXED-vs-PERCENTAGE resolution, not the caller.
	//
	// Note a behavior change from the old frontend-only math: a post-tax PERCENTAGE
	// charge now resolves against the post-tax gross amount (the engine's own
	// AFTER_TAX-base convention, matching PO/WO), whereas the retired client-side
	// preview always resolved every percentage charge against the pre-tax items
	// total regardless of basis. Pre-tax percentage charges are unaffected.
	const sameState = Boolean(doc.same_state);
	const engineItems = preparedItems.map((item) => ({
		qty: item.invoiced_qty,
		price: item.price,
		discount: item.discount,
		discountType: item.discount_price_type,
		rate: parseFloat(item.taxSnapshot?.rate ?? 0) || 0,
		cess: item.cess,
	}));
	const engineCharges = preparedCharges.map((charge, index) => ({
		_index: index,
		name: charge.description || 'Charge',
		calculationType: charge.value_type === 'percentage' ? 'PERCENTAGE' : 'FIXED',
		value: charge.amount,
		operation: charge.operation_type,
		applyOn: charge.charge_basis === 'post_tax' ? 'AFTER_TAX' : 'NET_TAXABLE_AMOUNT',
		taxTreatment: charge.tax_treatment || 'NON_TAXABLE',
		taxRate: charge.tax_rate != null ? parseFloat(charge.tax_rate) : null,
	}));

	const engineTotals = calculateDocumentTotals({
		items: engineItems,
		charges: engineCharges,
		sameState,
		roundOff: Boolean(isRoundOff),
	});

	preparedItems.forEach((item, index) => {
		const computed = engineTotals.items[index];
		item.igst = computed.igst;
		item.cgst = computed.cgst;
		item.sgst = computed.sgst;
		item.cess = computed.cess;
		item.total = computed.total;
	});

	[...engineTotals.preTaxCharges, ...engineTotals.postTaxCharges].forEach((result) => {
		const charge = preparedCharges[result._index];
		charge.igst = result.igst;
		charge.cgst = result.cgst;
		charge.sgst = result.sgst;
		charge.total = round2((result.amount || 0) + (result.tax || 0));
	});

	// total_taxable/total_tax deliberately exclude post-tax charges entirely — matching
	// PI's own pre-existing, explicitly-documented convention (see the model comment on
	// PurchaseInvoiceCharge.charge_basis): a post-tax charge's (amount, tax) lands only in
	// grandTotal, never in these two header fields. engineTotals.totalTaxable already
	// excludes post-tax charges by construction, but engineTotals.totalTax does NOT (the
	// engine's own definition of "total tax" is document-wide, including post-tax charges'
	// tax) — so it's adjusted back out here to preserve PI's convention rather than
	// silently redefining what this column has always meant. grandTotal needs no such
	// adjustment: the engine already folds post-tax charges in exactly once.
	const postTaxChargesTax = engineTotals.postTaxCharges.reduce((sum, c) => sum + (c.tax || 0), 0);
	const totalTaxable = engineTotals.totalTaxable;
	const totalTax = round2(engineTotals.totalTax - postTaxChargesTax);
	const roundOffAmount = engineTotals.roundOffAmount;
	const grandTotal = engineTotals.grandTotal;

	// Client can supply a prefix/postfix around the auto-generated number (same
	// pattern GRN's grnDetail uses) — falls back to auto-generating the number
	// itself if the client didn't already fetch one via generate-invoice-number.
	const invoiceNumber = invoiceDetail.invoiceNumber || (await exports.generateInvoiceNumber(req));

	// Charges were never matched against the order (see the other-charges comment above), so a
	// 20% freight line the PO never carried still read as 'matched'. Flag the invoice when this
	// order's invoices, cumulatively, bill more in charges than the PO/WO itself carried.
	const chargeVariance = await getInvoiceChargeVariance({
		documentType: document_type,
		documentId: doc.id,
		newChargesTotal: preparedCharges.reduce((sum, c) => sum + Number(c.total || 0), 0),
		tolerancePct: PRICE_VARIANCE_TOLERANCE_PCT,
	});
	if (chargeVariance) anyVariance = true;

	// Advisory budget check (authoritative one runs at approvePurchaseInvoice) — surfaced to the
	// maker as `budget_warnings` so an over-budget bill is visible before it reaches an approver.
	const budgetWarnings = await validateInvoiceBudget({
		invoice: {
			id: null,
			document_type,
			purchase_order_id: document_type === 'purchase_order' ? doc.id : null,
			work_order_id: document_type === 'work_order' ? doc.id : null,
			items: preparedItems,
			charges: preparedCharges,
		},
		enforce: false,
	});

	let invoice;
	const transaction = await sequelize.transaction();
	try {
		invoice = await PurchaseInvoice.create(
			{
				org_id,
				document_type,
				purchase_order_id: document_type === 'purchase_order' ? doc.id : null,
				work_order_id: document_type === 'work_order' ? doc.id : null,
				mrn_id: mrn?.id ?? null,
				qc_id: qcInspection?.id ?? null,
				invoicePrefix: invoiceDetail.invoicePrefix || null,
				invoiceNo: invoiceNumber,
				invoicePostfix: invoiceDetail.invoicePostfix || null,
				vendor_invoice_no,
				vendor_invoice_date,
				invoice_date: invoice_date || new Date(),
				vendor_snapshot: doc.vendorInfo ?? null,
				total_taxable: parseFloat(totalTaxable.toFixed(2)),
				total_tax: parseFloat(totalTax.toFixed(2)),
				grandTotal,
				isRoundOff: Boolean(isRoundOff),
				round_off_amount: roundOffAmount,
				matching_status: anyVariance ? 'variance_flagged' : 'matched',
				status: 'draft',
				remarks: remarks || null,
				created_by: actorSnapshot(req.user),
			},
			{ transaction },
		);

		await PurchaseInvoiceItem.bulkCreate(
			preparedItems.map((i) => ({ ...i, purchase_invoice_id: invoice.id })),
			{ transaction },
		);

		if (preparedCharges.length > 0) {
			await PurchaseInvoiceCharge.bulkCreate(
				preparedCharges.map((c) => ({ ...c, purchase_invoice_id: invoice.id })),
				{ transaction },
			);
		}

		const instance = await workflowEngine.startInstance({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: invoice.id,
			orgId: org_id,
			transaction,
		});

		await invoice.update({ status: instance.status }, { transaction });

		// A zero-stage workflow approves on creation — that is the commitment point then.
		if (instance.status === 'approved') {
			await validateInvoiceBudget({ invoice, enforce: true, transaction });
		}

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: invoice.id,
			action: 'create',
			newState: { document_type, document_id: doc.id, invoiceNo: invoiceNumber, grandTotal, items: preparedItems, other_charges: preparedCharges },
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	const created = await fetchInvoiceOrThrow(invoice.id);
	attachBudgetWarnings(created, budgetWarnings);
	if (chargeVariance) {
		if (typeof created.setDataValue === 'function') created.setDataValue('charge_variance', chargeVariance);
		else created.charge_variance = chargeVariance;
	}
	return created;
};

exports.getPurchaseInvoice = async (req, id) => {
	const invoice = await fetchInvoiceOrThrow(id);
	const plain = invoice.get({ plain: true });

	// Attach each item's active Product Group(s) here too, so the edit/view form can
	// cluster items by group — same approach as qc-inspection.service.js::getInspectionById.
	const productGroupsMap = await fetchProductGroupsByIds(req, (plain.items || []).map((item) => item.product_id));
	plain.items = (plain.items || []).map((item) => ({
		...item,
		product_groups: productGroupsMap.get(item.product_id) || [],
	}));

	return plain;
};

exports.listPurchaseInvoices = async (req, query = {}) => {
	const { org_id } = req.user;
	const where = { org_id };
	if (query.document_type) where.document_type = query.document_type;
	if (query.purchase_order_id) where.purchase_order_id = query.purchase_order_id;
	if (query.work_order_id) where.work_order_id = query.work_order_id;
	if (query.status) where.status = query.status;

	const { limit, offset } = query;
	const { count, rows } = await PurchaseInvoice.findAndCountAll({
		where,
		include: [
			{ model: PurchaseInvoiceItem, as: 'items' },
			{ model: PurchaseOrder, as: 'purchaseOrder', attributes: ['id', 'doc_number', 'poPrefix', 'poNo', 'poPostfix'] },
			{ model: WorkOrder, as: 'workOrder', attributes: ['id', 'doc_number', 'woPrefix', 'woNo', 'woPostfix'] },
		],
		order: [['createdAt', 'DESC']],
		distinct: true,
		...(limit ? { limit: Number(limit), offset: Number(offset || 0) } : {}),
	});

	const invoiceIds = rows.map((r) => r.id);
	const paymentSummaryById = await getPaymentSummaryByInvoiceId(invoiceIds, org_id);

	const rowsWithPaymentStatus = rows.map((r) => {
		const plain = r.toJSON();
		const pr = paymentSummaryById[r.id];
		// A single invoice can now be paid off across several REGULAR PRs (e.g.
		// 80% now, 20% later), so "PAID" means the approved total actually covers
		// the invoice's own grandTotal, not just "the latest PR is APPROVED" —
		// otherwise an 80%-paid invoice with the rest still outstanding read as
		// fully PAID. PARTIALLY_PAID covers the in-between: something's been
		// approved, but not enough to close it out yet.
		const grandTotal = parseFloat(plain.grandTotal || 0);
		if (!pr) {
			plain.payment_status = 'UNPAID';
		} else if (pr.total_approved_gross >= grandTotal - 0.01) {
			plain.payment_status = 'PAID';
		} else if (pr.total_approved_gross > 0) {
			plain.payment_status = 'PARTIALLY_PAID';
		} else {
			plain.payment_status = 'PENDING';
		}
		// Actual cash paid to the vendor (net of retention/TDS), not the gross
		// requisitioned value — unlike PO/WO.totalPaid (a procurement/budget
		// figure), this list is vendor-billing-facing so "Paid Amount" means
		// what actually left the org. net_payable here is already the sum of
		// every APPROVED requisition against this invoice (see
		// getPaymentSummaryByInvoiceId) — REGULAR plus any RETENTION_RELEASE —
		// so it isn't re-gated on a single PR's status here.
		plain.paid_amount = pr ? pr.net_payable : 0;
		plain.retention_held = pr ? pr.retention_held : 0;
		plain.linked_requisitions = pr ? pr.linked_requisitions : [];
		return plain;
	});

	return { count, rows: rowsWithPaymentStatus };
};

// A Purchase Invoice can carry more than one non-rejected PaymentRequisition:
// several REGULAR ones for partial drawdown (see payment-requisition.service.js's
// cumulative gross_amount cap at invoice.grandTotal), plus later
// RETENTION_RELEASE requisitions that release money withheld from them. So
// this aggregates across every PR per invoice instead of picking a single winning
// row — paid_amount sums every APPROVED requisition's net_payable, and
// retention_held nets the REGULAR PR's originally-withheld retention against
// whatever's since been released via an APPROVED RETENTION_RELEASE PR.
async function getPaymentSummaryByInvoiceId(invoiceIds, org_id) {
	if (!invoiceIds.length) return {};
	const prs = await PaymentRequisition.findAll({
		where: { purchase_invoice_id: { [Op.in]: invoiceIds }, org_id, status: { [Op.ne]: 'REJECTED' } },
		attributes: ['id', 'purchase_invoice_id', 'requisition_no', 'requisition_type', 'status', 'gross_amount', 'net_payable'],
		order: [['id', 'DESC']],
	});
	if (prs.length === 0) return {};

	const prIds = prs.map((pr) => pr.id);
	const retentionRows = await PaymentRequisitionDeduction.findAll({
		where: { payment_requisition_id: { [Op.in]: prIds }, deduction_type: 'RETENTION' },
		attributes: ['payment_requisition_id', 'amount'],
	});
	const retentionByPrId = {};
	for (const d of retentionRows) {
		retentionByPrId[d.payment_requisition_id] = (retentionByPrId[d.payment_requisition_id] || 0) + (parseFloat(d.amount) || 0);
	}

	const byInvoice = {};
	for (const pr of prs) {
		(byInvoice[pr.purchase_invoice_id] ||= []).push(pr);
	}

	const result = {};
	for (const [invoiceId, invoicePrs] of Object.entries(byInvoice)) {
		// Already sorted id DESC from the query above.
		const latest = invoicePrs[0];
		const regularPrs = invoicePrs.filter((pr) => pr.requisition_type !== 'RETENTION_RELEASE');
		const paidAmount = invoicePrs
			.filter((pr) => pr.status === 'APPROVED')
			.reduce((sum, pr) => sum + (parseFloat(pr.net_payable) || 0), 0);
		const retentionHeldOriginally = regularPrs.reduce((sum, pr) => sum + (retentionByPrId[pr.id] || 0), 0);
		const retentionReleased = invoicePrs
			.filter((pr) => pr.requisition_type === 'RETENTION_RELEASE' && pr.status === 'APPROVED')
			.reduce((sum, pr) => sum + (parseFloat(pr.net_payable) || 0), 0);
		// An invoice can now carry several non-rejected REGULAR PRs (partial
		// drawdown, e.g. 80% now / 20% later) instead of just one — these sum
		// across all of them so the list page can tell PAID (fully requisitioned
		// and approved) apart from PARTIALLY_PAID (some approved, some still
		// outstanding) instead of reading off a single "latest" row.
		const totalRegularGross = regularPrs.reduce((sum, pr) => sum + (parseFloat(pr.gross_amount) || 0), 0);
		const totalApprovedRegularGross = regularPrs
			.filter((pr) => pr.status === 'APPROVED')
			.reduce((sum, pr) => sum + (parseFloat(pr.gross_amount) || 0), 0);

		result[invoiceId] = {
			requisition_id: latest.id,
			requisition_no: latest.requisition_no,
			// Kept for callers that just want "the one to link to" — always the
			// most recently raised PR against this invoice, whichever type.
			status: latest.status,
			gross_amount: totalRegularGross,
			total_approved_gross: totalApprovedRegularGross,
			net_payable: paidAmount,
			retention_held: Math.max(0, retentionHeldOriginally - retentionReleased),
			// All non-rejected PRs against this invoice, oldest first — the
			// list-page tooltip shows every one (REGULAR + any RETENTION_RELEASE),
			// not just the single latest row.
			linked_requisitions: [...invoicePrs].reverse().map((pr) => ({
				id: pr.id,
				requisition_no: pr.requisition_no,
				requisition_type: pr.requisition_type,
				status: pr.status,
				net_payable: parseFloat(pr.net_payable) || 0,
			})),
		};
	}
	return result;
}

exports.approvePurchaseInvoice = async (req, id) => {
	const invoiceForAssert = await fetchInvoiceOrThrow(id);
	await piWorkflow.assertCanAct(req, invoiceForAssert);

	const stageNameBeforeAction = (
		await workflowEngine.getInstanceWithStages({ documentType: DOCUMENT_TYPE, documentId: id })
	).instance.currentStage?.stage_name ?? null;

	const transaction = await sequelize.transaction();
	try {
		// Re-fetch + lock so a concurrent/duplicate approve call on the same
		// invoice can't double-apply.
		const invoice = await PurchaseInvoice.findOne({
			where: { id },
			include: [{ model: PurchaseInvoiceItem, as: 'items' }],
			transaction,
			lock: transaction.LOCK.UPDATE,
		});
		if (!OPEN_STATUSES.includes(invoice.status)) {
			throw new AppError(`Cannot approve an invoice with status "${invoice.status}"`, StatusCodes.CONFLICT);
		}

		const config = resolveDocConfig(invoice.document_type);
		const parentId = invoice.document_type === 'work_order' ? invoice.work_order_id : invoice.purchase_order_id;
		const doc = await config.model.findOne({ where: { id: parentId }, transaction });
		const docItems = await config.itemModel.findAll({
			where: { id: invoice.items.map((line) => line.po_wo_item_id) },
			transaction,
		});
		const docItemsById = new Map(docItems.map((i) => [i.id, i]));

		// Re-validate the hard-block cap against CURRENT received/accepted/
		// invoiced qty, not the request-creation-time snapshot — mirrors
		// short-close's own re-validation at approval, the same race the
		// two-approvers-at-once scenario needs guarding against.
		for (const line of invoice.items) {
			const docItem = docItemsById.get(line.po_wo_item_id);
			const [receivedQty, alreadyInvoicedQty] = await Promise.all([
				docItem ? getCeilingQtyForItem(invoice.document_type, doc, docItem, { transaction }) : 0,
				purchaseInvoiceItemsRepository.sumInvoicedQtyForPoWoItem(line.po_wo_item_id, {
					excludeInvoiceId: invoice.id,
					transaction,
				}),
			]);
			const remaining = Math.max(0, receivedQty - alreadyInvoicedQty);
			if (parseFloat(line.invoiced_qty) > remaining + 0.001) {
				throw new AppError(
					`Only ${remaining} remaining against received/accepted qty for "${line.productSnapshot?.name || `item ${line.po_wo_item_id}`}"; ` +
						`this invoice's ${line.invoiced_qty} can no longer be approved`,
					StatusCodes.CONFLICT,
				);
			}
		}

		// Authoritative budget check, under the Budget row lock(s): this invoice is the actual for
		// its PO/WO, so anything it bills beyond the order (charges, rate, tax) must fit the
		// budget's effective limit or be covered by an approved Budget Revision first.
		await validateInvoiceBudget({ invoice, enforce: true, transaction });

		const instance = await workflowEngine.advanceStage({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: id,
			action: 'approved',
			transaction,
		});

		await invoice.update(
			{ status: instance.status, approved_by: actorSnapshot(req.user), approved_at: new Date() },
			{ transaction },
		);

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: id,
			action: 'approved',
			workflowStageName: stageNameBeforeAction,
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchInvoiceOrThrow(id);
};

exports.rejectPurchaseInvoice = async (req, id, remarks) => {
	const invoice = await fetchInvoiceOrThrow(id);
	if (!OPEN_STATUSES.includes(invoice.status)) {
		throw new AppError(`Cannot reject an invoice with status "${invoice.status}"`, StatusCodes.CONFLICT);
	}
	return piWorkflow.reject(req, id, remarks);
};

exports.cancelPurchaseInvoice = async (req, id, remarks) => {
	const invoice = await fetchInvoiceOrThrow(id);
	if (invoice.status === 'approved') {
		throw new AppError('An approved purchase invoice cannot be cancelled', StatusCodes.CONFLICT);
	}
	if (!OPEN_STATUSES.includes(invoice.status)) {
		throw new AppError(`This invoice is already ${invoice.status}`, StatusCodes.CONFLICT);
	}
	return piWorkflow.cancel(req, id, remarks);
};

/**
 * Reverses an APPROVED invoice (e.g. a data-entry error such as a wrong charge). Allowed only
 * while nothing downstream has consumed it:
 *   - no live Payment Requisition (anything not REJECTED) against it, and
 *   - no accounting voucher drafted/posted for it (voucher_* columns, where present).
 * Everything the invoice held is derived from its status, so flipping it to 'cancelled' is the
 * whole reversal: its invoiced qty stops counting (LIVE_STATUSES), so a corrected invoice can be
 * raised; its budget impact stops counting (budget-validation.service.js counts approved only).
 * Gated by its own permission action (`cancel_approved`), separate from ordinary `cancel`.
 */
exports.cancelApprovedPurchaseInvoice = async (req, id, remarks) => {
	if (!remarks || !remarks.trim()) {
		throw new AppError('A cancellation reason is required', StatusCodes.BAD_REQUEST);
	}

	const transaction = await sequelize.transaction();
	try {
		const invoice = await PurchaseInvoice.findOne({
			where: { id, org_id: req.user.org_id },
			transaction,
			lock: transaction.LOCK.UPDATE,
		});
		if (!invoice) throw new AppError(`Purchase Invoice with ID ${id} not found`, StatusCodes.NOT_FOUND);
		if (invoice.status !== 'approved') {
			throw new AppError('Only an approved invoice can be reversed this way — use Cancel for draft/in-progress invoices', StatusCodes.CONFLICT);
		}

		const livePrCount = await PaymentRequisition.count({
			where: { purchase_invoice_id: invoice.id, status: { [Op.ne]: 'REJECTED' } },
			transaction,
		});
		if (livePrCount > 0) {
			throw new AppError(
				`Cannot cancel: ${livePrCount} payment requisition${livePrCount > 1 ? 's are' : ' is'} raised against this invoice. Reject ${livePrCount > 1 ? 'them' : 'it'} first.`,
				StatusCodes.CONFLICT,
			);
		}

		// Voucher columns come from the voucher-posting feature and aren't on this model/branch
		// everywhere — read them raw, and treat "column doesn't exist" as "no voucher".
		try {
			const [rows] = await sequelize.query(
				'SELECT voucher_status, voucher_posting_id, external_voucher_id FROM purchase_invoices WHERE id = ?',
				{ replacements: [invoice.id], transaction },
			);
			const v = rows?.[0];
			if (v && (v.voucher_status || v.voucher_posting_id || v.external_voucher_id)) {
				throw new AppError(
					'Cannot cancel: an accounting voucher has already been drafted/posted for this invoice. Reverse it in accounts first.',
					StatusCodes.CONFLICT,
				);
			}
		} catch (error) {
			if (error instanceof AppError) throw error;
			if (error?.original?.code !== 'ER_BAD_FIELD_ERROR') throw error;
		}

		const before = { status: invoice.status, approved_by: invoice.approved_by, approved_at: invoice.approved_at };
		const cancelledInstance = await workflowEngine.cancelInstance({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: invoice.id,
			remarks,
			transaction,
		});
		await invoice.update({ status: cancelledInstance.status }, { transaction });

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: invoice.id,
			action: 'cancelled_after_approval',
			remarks,
			previousState: before,
			newState: { status: cancelledInstance.status },
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchInvoiceOrThrow(id);
};

exports.getPurchaseInvoiceWorkflow = async (req, id) => piWorkflow.getWorkflow(req, id);
