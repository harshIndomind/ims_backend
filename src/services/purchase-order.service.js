const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const {
	purchaseOrderRepository,
	purchaseOrderItemsRepository,
	purchaseOrderSerialItemsRepository,
	IndentItemRepository,
	documentChargesRepository,
} = require('../repository/index');
const { calculateDocumentTotals, legacyCustomFieldsToCharges } = require('../utils/charge-tax-engine.util');
const {
	validateDocumentAgainstIndentBudget,
	taxableAmountOf,
	validateBudgetCommitment,
	computeDocumentBudgetComponents,
	componentsForStoredDocument,
	attachBudgetWarnings,
} = require('./budget-validation.service');
const { round2 } = require('../utils/money');
const { toEngineItems, chargeBreakdownToRows, dbRowsToCharges } = require('../utils/document-charges.helper');
const paymentRequisitionAnalyticsRepo = require('../repository/payment-requisition-analytics.repository');
const { fetchProductGroupsByIds } = require('../utils/vcpProductGroups');
const logger = require('../utils/logger');
const { sequelize } = require('../models/index');
const { Op, where, QueryTypes } = require('sequelize');
const {
	User,
	organization,
	PurchaseOrder,
	PurchaseOrderItem,
	IndentItem,
	Indent,
	Role,
	PaymentRequisition,
	MasterTermsCondition,
	MasterUnit,
	Department,
	MasterPlaceOfUse,
	GoodsReceiptNoteItem,
	QcInspectionItem,
	PurchaseInvoiceItem,
	ShortCloseRequestItem,
} = require('../models/index');
const {
	generateInvoiceHTMLPDF,
	generateInvoiceHTML,
} = require('../pdf/htmlPdfGenerator');
const { fetch } = require('undici');
const { VCP_SERVICE_API_BASE_URL, BASE_URL } = require('../config/serverConfig');
const { generateSignedUrl, getImageAsBase64DataUrl } = require('../utils/s3Bucket');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs/promises');
const workflowEngine = require('./workflowEngine.service');
const auditLogService = require('./auditLog.service');
const indentQtyLogService = require('./indentQtyLog.service');
const { createWorkflowDocumentService } = require('./workflowDocument.factory');
const orderDispatchService = require('./orderDispatch.service');
const { generateDocumentNumber } = require('./document-numbering.service');
const { resolveUnitAndMajorHeadCodes } = require('./document-header-codes.service');
const { existsSync } = require('node:fs');

const DOCUMENT_TYPE = 'purchase_order';

async function fetchPurchaseOrderForWorkflow(id) {
	const po = await purchaseOrderRepository.findOne({
		where: { id },
		include: [
			{ model: PurchaseOrderItem, as: 'items' },
			{ model: Indent, as: 'indent', attributes: ['id', 'unit_id', 'department_id'] },
		],
	});
	if (!po) throw new AppError(`Purchase Order with ID ${id} not found`, StatusCodes.NOT_FOUND);
	return po;
}

const poWorkflow = createWorkflowDocumentService({
	documentType: DOCUMENT_TYPE,
	fetchById: (id) => fetchPurchaseOrderForWorkflow(id),
});

exports.createPurchaseOrder = async (req, payload) => {
	const transaction = await sequelize.transaction();
	try {
		const { org_id } = req.user;

		// Preserves the role gate that used to live in the now-removed generate-po-number
		// "peek" endpoint — checkPermission('purchase-order', 'create') alone isn't enough
		// since it bypasses everything for super_admin.
		if (!req.user.org_id || req.user.roles.includes('super_admin')) {
			const errorMsg = req.user.roles.includes('super_admin')
				? "As a super admin user you can't create a purchase order."
				: 'Invalid user or organization ID';
			throw new AppError(errorMsg, 403);
		}

		const {
			indent_id,
			po_qc_check,
			dueDate,
			total_taxable,
			total_tax,
			isRoundOff,
			grandTotal,
			payment_type,
			bank_id,
			additionalRemarks,
			state_same,
			orderType,
			// Objects
			vendorInfo,
			purchaseOrderDetail,
			productItems,
			paymentType,
			additionalNotes,
			customField1,
			customField2,
			charges,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
			payment_term_value,
			payment_term_amount
		} = req.body;

		const indentForBudget = await Indent.findOne({ where: { id: indent_id }, attributes: ['budgetType'], transaction });
		validateItemsLimits(productItems, indentForBudget?.budgetType);

		const isSerialDuplicate = checkForDuplicateSerials(productItems);

		if (isSerialDuplicate.status) {
			throw new AppError(
				`Duplicate serial numbers found in the invoice items: ${isSerialDuplicate.duplicateSerials.join(
					', ',
				)}`,
				417,
			);
		}

		const { unitShortCode, majorHeadCode } = await resolveUnitAndMajorHeadCodes({
			indentId: indent_id,
			productItems,
			transaction,
		});
		const { docNumber, sequenceNo, fiscalYear } = await generateDocumentNumber({
			orgId: org_id,
			docType: 'PO',
			unitShortCode,
			majorHeadCode,
			transaction,
		});

		// Backend is the source of truth for persisted financial totals — the client's own
		// total_taxable/total_tax/grandTotal/item tax fields are only used for live UI feedback,
		// never trusted for what gets saved. See charge-tax-engine.util.js.
		const sameState = Boolean(state_same);
		const totals = calculateDocumentTotals({
			items: toEngineItems(productItems),
			charges: charges || [],
			sameState,
			roundOff: Boolean(isRoundOff),
		});

		// Advisory at this point (a draft PO commits nothing against the indent until
		// submitPurchaseOrder — see below), but running it here too mirrors validateItemsLimits'
		// own create-time check just above and gives the user the same fail-fast feedback for
		// value-wise budgets that item-wise budgets already get for qty.
		await validateDocumentAgainstIndentBudget({
			indent_id,
			lines: productItems.map((item, i) => ({
				product_id: item.product_id,
				uom_id: item.selected_uom_id,
				taxableAmount: totals.items[i].taxableAmount,
			})),
			matchUom: true,
			documentLabel: 'this Purchase Order',
			transaction,
		});

		// Budget-level commitment limit (charges + non-recoverable tax included). Advisory for a
		// draft — the authoritative, locked check runs at submitPurchaseOrder — so an over-limit
		// draft can still be saved while its Budget Revision is raised; the warning goes back to
		// the client as `budget_warnings`.
		const budgetWarnings = await validateBudgetCommitment({
			components: computeDocumentBudgetComponents(
				totals,
				productItems.map((item) => ({ budget_id: item.budget_id })),
			),
			documentType: DOCUMENT_TYPE,
			documentLabel: 'this Purchase Order',
			enforce: false,
			transaction,
		});

		const poObject = {
			org_id,
			indent_id,
			orderType: orderType || 'purchase_order',
			vendorId: vendorInfo.vendor_id || null,
			dueDate,
			doc_number: docNumber,
			doc_sequence_no: sequenceNo,
			doc_fiscal_year: fiscalYear,
			total_taxable: totals.totalTaxable,
			total_tax: totals.totalTax,
			grandTotal: totals.grandTotal,
			isRoundOff,
			paymentType: payment_type,
			vendorInfo,
			poDetail: purchaseOrderDetail,
			additionalNotes,
			customFields: [customField1, customField2],
			remarks: additionalRemarks,
			same_state: state_same,
			status: 'draft',
			remainingAmount: totals.grandTotal,
			po_qc_check,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
			payment_term_value,
			payment_term_amount,
			start_date: purchaseOrderDetail.start_date || null,
			end_date: purchaseOrderDetail.end_date || null,
			retention: purchaseOrderDetail.retention != null ? parseFloat(purchaseOrderDetail.retention) : null,
			retention_amount: purchaseOrderDetail.retention != null
				? round2((parseFloat(purchaseOrderDetail.retention) / 100) * totals.grandTotal)
				: null,
		};

		const purchaseOrder = await purchaseOrderRepository.create(poObject, {
			transaction,
		});

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: purchaseOrder.id,
			action: 'create',
			newState: { doc_number: poObject.doc_number },
			transaction,
		});

		for (let i = 0; i < productItems.length; i++) {
			const item = productItems[i];
			const computedItem = totals.items[i];
			const poItemsObject = {
				purchase_order_id: purchaseOrder.id,
				product_id: item.product_id,
				budget_id: item.budget_id,
				productSnapshot: item.productSnapshot,
				uomSnapshot: item.uomSnapshot || null,
				taxSnapshot: item.taxSnapshot || null,
				budget_no: item.budget_no,
				batch_id: item.batch_id || null,
				hsn_sac_code: item.hsn_sac_code || null,
				qty: parseFloat(item.qty),
				price: parseFloat(item.price),
				discount: parseFloat(item.discount || 0),
				discount_price_type: item.discount_price_type,
				tax_id: item.tax_id,
				igst: computedItem.igst,
				cgst: computedItem.cgst,
				sgst: computedItem.sgst,
				cess: computedItem.cess,
				total: computedItem.total,
				stock_type: item.stock_type,
				note: item.note,
				selected_uom_id:
					Number(item.selected_uom_id) > 0
						? Number(item.selected_uom_id)
						: null,
				specification: item.specification,
				rate_contract_id: item.rate_contract_id || null,
				rate_contract_product_id: item.rate_contract_product_id || null,
				rc_snapshot: item.rc_snapshot || null,
			};
			await purchaseOrderItemsRepository.create(
				poItemsObject,
				{ transaction },
			);
		}

		await documentChargesRepository.bulkReplaceForDocument(
			DOCUMENT_TYPE,
			purchaseOrder.id,
			chargeBreakdownToRows([...totals.preTaxCharges, ...totals.postTaxCharges]),
			{ transaction },
		);

		await transaction.commit();

		attachBudgetWarnings(purchaseOrder, budgetWarnings);
		return purchaseOrder;
	} catch (error) {
		await transaction.rollback();
		console.error(error);
		throw error;
	}
};

exports.updatePurchaseOrder = async (req) => {
	const { id } = req.params;

	const transaction = await sequelize.transaction();
	try {
		const {
			org_id,
			indent_id,
			po_qc_check,
			dueDate,
			total_taxable,
			total_tax,
			isRoundOff,
			grandTotal,
			payment_type,
			bank_id,
			additionalRemarks,
			state_same,
			orderType,
			// Objects
			vendorInfo,
			purchaseOrderDetail,
			productItems,
			paymentType,
			additionalNotes,
			customField1,
			customField2,
			charges,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
			payment_term_value,
			payment_term_amount
		} = req.body;

		const indentForBudget = await Indent.findOne({ where: { id: indent_id }, attributes: ['budgetType'], transaction });
		validateItemsLimits(productItems, indentForBudget?.budgetType);

		const isSerialDuplicate = checkForDuplicateSerials(productItems);

		if (isSerialDuplicate.status) {
			throw new AppError(
				`Duplicate serial numbers found in the invoice items: ${isSerialDuplicate.duplicateSerials.join(
					', ',
				)}`,
				417,
			);
		}

		const sameState = Boolean(state_same);
		const totals = calculateDocumentTotals({
			items: toEngineItems(productItems),
			charges: charges || [],
			sameState,
			roundOff: Boolean(isRoundOff),
		});

		// excludePurchaseOrderId=id: this PO's own pre-edit lines must not count as
		// "already committed" on top of the new lines being validated here.
		await validateDocumentAgainstIndentBudget({
			indent_id,
			lines: productItems.map((item, i) => ({
				product_id: item.product_id,
				uom_id: item.selected_uom_id,
				taxableAmount: totals.items[i].taxableAmount,
			})),
			matchUom: true,
			excludePurchaseOrderId: Number(id),
			documentLabel: 'this Purchase Order',
			transaction,
		});

		const poObject = {
			org_id,
			indent_id,
			orderType: orderType || 'purchase_order',
			vendorId: vendorInfo.vendor_id || null,
			dueDate,
			poPrefix: purchaseOrderDetail.poPrefix || null,
			poNo: purchaseOrderDetail.poNumber || null,
			poPostfix: purchaseOrderDetail.poPostfix || null,
			total_taxable: totals.totalTaxable,
			total_tax: totals.totalTax,
			grandTotal: totals.grandTotal,
			isRoundOff,
			paymentType: payment_type,
			vendorInfo,
			poDetail: purchaseOrderDetail,
			additionalNotes,
			customFields: [customField1, customField2],
			remarks: additionalRemarks,
			same_state: state_same,
			remainingAmount: totals.grandTotal,
			po_qc_check,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
			payment_term_value,
			payment_term_amount,
			start_date: purchaseOrderDetail.start_date || null,
			end_date: purchaseOrderDetail.end_date || null,
			retention: purchaseOrderDetail.retention != null ? parseFloat(purchaseOrderDetail.retention) : null,
			retention_amount: purchaseOrderDetail.retention != null
				? round2((parseFloat(purchaseOrderDetail.retention) / 100) * totals.grandTotal)
				: null,
		};

		// status is intentionally omitted from the update payload — the workflow engine
		// is the sole owner of status transitions after creation.

		const purchaseOrder = await purchaseOrderRepository.findById(id, {
			transaction,
		});

		if (!purchaseOrder) {
			throw new AppError('Pruchase order not found.');
		}

		// Same gate indent.service.js's updateIndent uses — once the workflow has moved
		// past the lock stage (or resolved to approved/cancelled), the PO's items and
		// header stop being editable at all, matching the UX indent already has. This
		// closes off the normal path to the item-removal guard below entirely (an
		// approved PO can no longer reach it at all) — that guard stays as
		// defense-in-depth for whatever edge case still lets an edit through with
		// existing GRN/QC/Invoice history attached (e.g. a workflow definition with a
		// late lock_stage_sequence).
		const editable = await workflowEngine.isEditable({ documentType: DOCUMENT_TYPE, documentId: purchaseOrder.id });
		if (!editable) {
			throw new AppError('This Purchase Order can no longer be edited at its current workflow stage', StatusCodes.FORBIDDEN);
		}

		// A draft PO has never deducted anything from the indent yet — that only happens at
		// submit (see submitPurchaseOrder), using whatever qty sits on the PO items at that
		// point. So editing a still-draft PO needs no indent-qty adjustment at all. Only a PO
		// that has already been submitted (deduction already applied) needs its edit reconciled
		// against the indent here. Captured before purchaseOrderRepository.update() below, which
		// mutates `purchaseOrder` in place.
		const wasSubmitted = purchaseOrder.status !== 'draft';

		// A submitted PO is already committed against its budget(s), so re-validating its edit is
		// authoritative (locked, throws); a draft edit is advisory only, same as create.
		const budgetWarnings = await validateBudgetCommitment({
			components: computeDocumentBudgetComponents(
				totals,
				productItems.map((item) => ({ budget_id: item.budget_id })),
			),
			documentType: DOCUMENT_TYPE,
			excludeDocumentId: Number(id),
			documentLabel: 'this Purchase Order',
			enforce: wasSubmitted,
			transaction,
		});
		// Same indent for the whole edit — this is the request body's indent_id, already in
		// scope above, not purchaseOrder.indent_id (which update() below would overwrite anyway
		// if the payload changed it).
		const indentIdForQtyAdjust = indent_id;
		const qtyAdjustMeta = { req, source: 'po_updated', sourceRefId: purchaseOrder.id };

		await purchaseOrderRepository.update(purchaseOrder, poObject, {
			transaction,
		});

		// Fetch all current PO items so we can detect additions and removals.
		const existingItems = await PurchaseOrderItem.findAll({
			where: { purchase_order_id: purchaseOrder.id },
			transaction,
		});
		const existingById = new Map(existingItems.map((e) => [e.id, e]));

		// IDs present in the new payload — used to detect removed items.
		const payloadIds = new Set(
			productItems.filter((i) => i.id).map((i) => Number(i.id)),
		);

		// Block removing a line that already has downstream history — destroying
		// it would either cascade-delete rows that reference it (GRN items have
		// an ON DELETE CASCADE FK to PurchaseOrderItem) or leave a dangling
		// po_wo_item_id behind on rows that don't (QC/Purchase Invoice/Short
		// Close items store it as a plain polymorphic int, no FK) — either way
		// silently destroying real receipt/inspection/billing history. This
		// isn't a "your data is stale" race like the indent-budget check above;
		// it's the codebase's only line of defense against exactly what happened
		// once already: an edit meant to change an unrelated header field (e.g.
		// delivery type) wiped a line's GRN receipt and orphaned its QC/Invoice
		// records because the client resubmitted the item without its id.
		const idsToRemove = existingItems.filter((e) => !payloadIds.has(e.id)).map((e) => e.id);
		if (idsToRemove.length > 0) {
			const [grnCount, qcCount, invoiceCount, shortCloseCount] = await Promise.all([
				GoodsReceiptNoteItem.count({ where: { purchase_order_item_id: { [Op.in]: idsToRemove } }, transaction }),
				QcInspectionItem.count({ where: { po_wo_item_id: { [Op.in]: idsToRemove } }, transaction }),
				PurchaseInvoiceItem.count({ where: { po_wo_item_id: { [Op.in]: idsToRemove } }, transaction }),
				ShortCloseRequestItem.count({ where: { po_wo_item_id: { [Op.in]: idsToRemove } }, transaction }),
			]);
			if (grnCount > 0 || qcCount > 0 || invoiceCount > 0 || shortCloseCount > 0) {
				const removedNames = existingItems
					.filter((e) => idsToRemove.includes(e.id))
					.map((e) => e.productSnapshot?.name || `item ${e.id}`)
					.join(', ');
				throw new AppError(
					`Cannot remove "${removedNames}" from this Purchase Order — it already has MRN receipt, QC, Invoice, or Short Close history against it. ` +
						`Editing the productItems array must keep this line's existing id (only its editable fields, not the row itself, should change).`,
					StatusCodes.CONFLICT,
				);
			}
		}

		// Remove items that are no longer in the payload.
		for (const existing of existingItems) {
			if (!payloadIds.has(existing.id)) {
				if (wasSubmitted) {
					// Restores what submit had deducted for this now-removed line.
					await applyIndentQtyDelta(
						parseFloat(existing.qty),
						indentIdForQtyAdjust,
						existing.product_id,
						existing.selected_uom_id ?? null,
						transaction,
						qtyAdjustMeta,
					);
				}
				await existing.destroy({ transaction });
			}
		}

		for (let i = 0; i < productItems.length; i++) {
			const item = productItems[i];
			const computedItem = totals.items[i];
			const poItemsObject = {
				purchase_order_id: purchaseOrder.id,
				product_id: item.product_id,
				budget_id: item.budget_id,
				productSnapshot: item.productSnapshot,
				uomSnapshot: item.uomSnapshot || null,
				taxSnapshot: item.taxSnapshot || null,
				budget_no: item.budget_no,
				batch_id: Number(item.batch_id) || null,
				hsn_sac_code: item.hsn_sac_code || null,
				qty: parseFloat(item.qty),
				price: parseFloat(item.price),
				discount: parseFloat(item.discount || 0),
				discount_price_type: item.discount_price_type,
				tax_id: item.tax_id,
				igst: computedItem.igst,
				cgst: computedItem.cgst,
				sgst: computedItem.sgst,
				cess: computedItem.cess,
				total: computedItem.total,
				stock_type: item.stock_type,
				note: item.note,
				selected_uom_id:
					Number(item.selected_uom_id) > 0
						? Number(item.selected_uom_id)
						: null,
				specification: item.specification,
				rate_contract_id: item.rate_contract_id || null,
				rate_contract_product_id: item.rate_contract_product_id || null,
				rc_snapshot: item.rc_snapshot || null,
			};

			if (item.id && existingById.has(Number(item.id))) {
				const existing = existingById.get(Number(item.id));
				// Captured before update() mutates `existing` in place.
				const oldQty = parseFloat(existing.qty);
				const oldProductId = existing.product_id;
				const oldUomId = existing.selected_uom_id ?? null;

				if (wasSubmitted) {
					// Always restore-then-deduct as two separate calls (not one net delta) —
					// same convention as work-order.service.js's updateWorkOrder, and the only
					// form that still works correctly when product/UOM changed (those are two
					// different IndentItem rows, matched by product_id + uom_id, so they can't
					// be netted into a single delta).
					await applyIndentQtyDelta(
						oldQty,
						indentIdForQtyAdjust,
						oldProductId,
						oldUomId,
						transaction,
						qtyAdjustMeta,
					);
					await applyIndentQtyDelta(
						-parseFloat(item.qty),
						indentIdForQtyAdjust,
						poItemsObject.product_id,
						poItemsObject.selected_uom_id,
						transaction,
						qtyAdjustMeta,
					);
				}

				await purchaseOrderItemsRepository.update(existing, poItemsObject, { transaction });
			} else {
				// New item added during update — submit never accounted for this line, so it
				// must be deducted from the indent now (mirrors what submit does for the items
				// that were present at submit time).
				if (wasSubmitted) {
					await applyIndentQtyDelta(
						-parseFloat(item.qty),
						indentIdForQtyAdjust,
						poItemsObject.product_id,
						poItemsObject.selected_uom_id,
						transaction,
						qtyAdjustMeta,
					);
				}
				await purchaseOrderItemsRepository.create(poItemsObject, { transaction });
			}
		}

		await documentChargesRepository.bulkReplaceForDocument(
			DOCUMENT_TYPE,
			purchaseOrder.id,
			chargeBreakdownToRows([...totals.preTaxCharges, ...totals.postTaxCharges]),
			{ transaction },
		);

		await transaction.commit();

		attachBudgetWarnings(purchaseOrder, budgetWarnings);
		return purchaseOrder;
	} catch (error) {
		await transaction.rollback();
		console.error(error);
		throw error;
	}
};

/**
 * Shared by getAllPurchaseOrders (list) and exportPurchaseOrders (Excel) so the two can never
 * silently drift apart — "Export" is meant to download exactly what the list page is currently
 * showing, so it must apply the identical set of filters the same way.
 */
// Resolves the "workflow_status" list-page filter to a set of matching PO ids via one plain
// SQL query per call, rather than trying to express the QC/receipt join as Sequelize
// association `where`s — QcInspection links to its PO polymorphically (document_type/
// document_id, no FK), same idiom grn.service.js uses throughout, and "has anything been
// received yet" needs a join through PurchaseOrderItems that doesn't map to an existing
// association either. Mirrors the join shape of getPoReceivedValue in grn.service.js (active
// GRNs only — a cancelled GRN doesn't count as "received").
async function getPoIdsForWorkflowStatus(orgId, workflowStatus) {
	const approvedQcExists = `EXISTS (
		SELECT 1 FROM qc_inspections qi
		WHERE qi.document_type = 'purchase_order' AND qi.document_id = po.id AND qi.status = 'approved'
	)`;
	const anyReceivedQtyExists = `EXISTS (
		SELECT 1 FROM GoodsReceiptNoteItems gi
		JOIN GoodsReceiptNotes g ON g.id = gi.goods_receipt_note_id AND g.status = 'active'
		JOIN PurchaseOrderItems poi ON poi.id = gi.purchase_order_item_id
		WHERE poi.purchase_order_id = po.id
	)`;

	let sql;
	switch (workflowStatus) {
		case 'qc_required':
			sql = `SELECT po.id FROM PurchaseOrders po WHERE po.org_id = :orgId AND po.po_qc_check = true`;
			break;
		case 'qc_pending':
			sql = `SELECT po.id FROM PurchaseOrders po WHERE po.org_id = :orgId AND po.po_qc_check = true AND NOT ${approvedQcExists}`;
			break;
		case 'mrn_pending':
			sql = `
				SELECT po.id FROM PurchaseOrders po
				WHERE po.org_id = :orgId
				AND (po.po_qc_check = false OR ${approvedQcExists})
				AND NOT ${anyReceivedQtyExists}
			`;
			break;
		case 'approved':
			sql = `SELECT po.id FROM PurchaseOrders po WHERE po.org_id = :orgId AND po.status = 'approved'`;
			break;
		default:
			return null;
	}

	const rows = await sequelize.query(sql, { replacements: { orgId }, type: QueryTypes.SELECT });
	return rows.map((r) => r.id);
}

async function buildPurchaseOrderFilters(req) {
	const { org_id } = req.user;
	const { from_date, to_date, unit_id, due_date_from, due_date_to, payment_status, dispatch_status_filter, workflow_status } = req.query;

	const andConditions = [{ org_id }];

	if (from_date || to_date) {
		const fromDate = new Date(from_date);
		const toDate = new Date(to_date);
		if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
			throw new AppError('Invalid date range');
		}
		toDate.setHours(23, 59, 59, 999);
		andConditions.push({ createdAt: { [Op.between]: [fromDate, toDate] } });
	}

	if (due_date_from || due_date_to) {
		const dueDateWhere = {};
		if (due_date_from) {
			const d = new Date(due_date_from);
			d.setHours(0, 0, 0, 0);
			dueDateWhere[Op.gte] = d;
		}
		if (due_date_to) {
			const d = new Date(due_date_to);
			d.setHours(23, 59, 59, 999);
			dueDateWhere[Op.lte] = d;
		}
		andConditions.push({ dueDate: dueDateWhere });
	}

	if (payment_status) {
		const statuses = payment_status.split(',').map((s) => s.trim()).filter(Boolean);
		const hasCancelled = statuses.includes('CANCELLED');
		const paymentStatuses = statuses.filter((s) => s !== 'CANCELLED');

		if (hasCancelled && paymentStatuses.length > 0) {
			andConditions.push({ [Op.or]: [{ paymentStatus: { [Op.in]: paymentStatuses } }, { status: 'cancelled' }] });
		} else if (hasCancelled) {
			andConditions.push({ status: 'cancelled' });
		} else if (paymentStatuses.length > 0) {
			andConditions.push({ paymentStatus: { [Op.in]: paymentStatuses } });
		}
	}

	// 'pending_dispatch': approved but not yet dispatched at all — a draft/in_progress PO's
	// dispatch_status is also 'not_dispatched' by default, but it isn't actionable for dispatch
	// yet, so this filter requires status === 'approved' too, not just the raw column value.
	// 'pending_acknowledgement': dispatched but not yet acknowledged (status is implicitly
	// 'approved' already, since dispatch_status can only reach 'dispatched' from there).
	if (dispatch_status_filter === 'pending_dispatch') {
		andConditions.push({ status: 'approved', dispatch_status: 'not_dispatched' });
	} else if (dispatch_status_filter === 'pending_acknowledgement') {
		andConditions.push({ dispatch_status: 'dispatched' });
	}

	// 'qc_required': po_qc_check is set, regardless of how far QC/receipt has progressed.
	// 'qc_pending': QC is required and no inspection on it has been approved yet.
	// 'mrn_pending': QC (if required) is approved — or not required at all — but nothing has
	// been received against this PO yet.
	// 'approved': the PO's own approval status, independent of QC/receipt progress.
	// These buckets aren't mutually exclusive (e.g. a PO can be both 'approved' and
	// 'qc_required'), so this is a single-select filter rather than combinable with itself.
	if (workflow_status) {
		const matchingIds = await getPoIdsForWorkflowStatus(org_id, workflow_status);
		if (matchingIds) andConditions.push({ id: { [Op.in]: matchingIds } });
	}

	return { andConditions, unitId: unit_id ? Number(unit_id) : null };
}

exports.getAllPurchaseOrders = async (req) => {
	const { org_id, role } = req.user;

	const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
	const offset = req.query.offset ? parseInt(req.query.offset) : undefined;

	if (!org_id && role !== 'Admin') {
		throw new AppError(`You don't authorize to access this api.`);
	}

	const { andConditions, unitId } = await buildPurchaseOrderFilters(req);

	const findOptions = {
		where: { [Op.and]: andConditions },
		attributes: [
			'id',
			'poPrefix',
			'poNo',
			'poPostfix',
			'doc_number',
			'dueDate',
			'grandTotal',
			'totalPaid',
			'remainingAmount',
			'poDetail',
			'status',
			'createdAt',
			'paymentStatus',
			'vendorInfo',
			'dispatch_status',
			'po_qc_check'
		],
		include: [
			{
				model: PaymentRequisition,
				as: 'paymentRequisitions',
				attributes: ['id', 'requisition_no', 'requisition_amount', 'status'],
				where: { status: 'APPROVED' },
				required: false,
			},
			{
				model: Indent,
				as: 'indent',
				attributes: ['id', 'unit_id', 'department_id', 'indent_no'],
				where: unitId ? { unit_id: unitId } : undefined,
				required: !!unitId,
				include: [
					{ model: MasterUnit, as: 'unit', attributes: ['id', 'unitName', 'unitCd'] },
					{ model: Department, as: 'department', attributes: ['id', 'name'] },
				],
			},
		],
		order: [['createdAt', 'DESC']],
	};

	if (limit !== undefined) findOptions.limit = limit;
	if (offset !== undefined) findOptions.offset = offset;

	const purchaseOrders = await purchaseOrderRepository.findAll(findOptions);

	let response = purchaseOrders.rows.map((inv) => inv.get({ plain: true }));
	console.log('response ', response);

	if (purchaseOrders) {
		response = response.map((invoice) => {
			return {
				...invoice,
				paymentMsg: (() => {
					let message = null;
					const ref = [];
					if (invoice.payments && invoice.payments.length > 0) {
						const totalAmountPaid = invoice.payments.reduce(
							(acc, v) => acc + parseFloat(v.amount_adjusted),
							0,
						);
						invoice.payments.forEach((payment, i) => {
							ref.push(
								`Ref-${i + 1}: Receipt No. ${payment.receipt.receiptPrefix}${
									payment.receipt.receiptNumber
								}${payment.receipt.receiptPostfix} - Payment of '${
									payment.amount_adjusted
								}' paid through ${String(
									payment?.receipt.paymentType.toLowerCase(),
								)}.`,
							);
						});
						// message = `Payment of '${totalAmountPaid}' paid through ${String(
						// 	invoice.payments[0]?.receipt.paymentType
						// )}.`;
						message = ref;
					}
					return message;
				})(),
			};
		});
	}

	// Retention held/released is only ever computed from PaymentRequisitionDeductions/
	// PaymentRequisitions (single source of truth, no denormalized column to drift out
	// of sync) — fetched here in one batched query per page load rather than a stored
	// column, since it only needs to be fresh at list-view time, not on every write.
	const orderIds = response.map((po) => po.id);
	const retentionByOrderId = await paymentRequisitionAnalyticsRepo.getRetentionSummaryBulk({
		idField: 'po_id',
		ids: orderIds,
		org_id,
	});
	// The `paymentRequisitions` include above only matches po_id-direct rows —
	// once this PO has a Purchase Invoice, its requisitions are invoice-anchored
	// (purchase_invoice_id set, po_id null) and would otherwise show an empty
	// tooltip under a nonzero totalPaid. Bulk-fetched and merged in here.
	const requisitionsByOrderId = await paymentRequisitionAnalyticsRepo.getApprovedRequisitionsBulk({
		idField: 'po_id',
		ids: orderIds,
		org_id,
	});
	response = response.map((po) => ({
		...po,
		retention_held: retentionByOrderId[po.id]?.retention_held || 0,
		retention_released: retentionByOrderId[po.id]?.retention_released || 0,
		retention_balance: retentionByOrderId[po.id]?.retention_balance || 0,
		paymentRequisitions: requisitionsByOrderId[po.id] || po.paymentRequisitions || [],
	}));

	return { rows: response, count: purchaseOrders.count };
};

exports.getPurchaseOrderById = async (req) => {
	const { id } = req.params;
	const { org_id, role } = req.user;

	if (!org_id && role !== 'Admin') {
		throw AppError(`You don't authorize to access this api.`);
	}

	const purchaseOrder = await purchaseOrderRepository.findOne({
		where: { id, org_id: org_id },
		include: [
			{
				model: PurchaseOrderItem,
				as: 'items',
				include: [
					// {
					// 	model: InvoiceItemSerial,
					// 	as: 'serials',
					// },
					// {
					// 	model: ProductBatch,
					// 	as: 'batches',
					// },
					// {
					// 	model: Product,
					// 	as: 'product',
					// },
					// {
					// 	model: ProductUOM,
					// 	as: 'uoms',
					// 	include: {
					// 		model: Unit,
					// 		as: 'unit',
					// 		attributes: ['code', 'name'],
					// 	},
					// },
				],
			},
			{
				model: Indent,
				as: 'indent',
				attributes: ['id', 'unit_id', 'department_id', 'period_id', 'place_of_use_id'],
				include: [
					{ model: MasterUnit, as: 'unit', attributes: ['id', 'unitName', 'unitCd'] },
					{ model: Department, as: 'department', attributes: ['id', 'name'] },
					{ model: MasterPlaceOfUse, as: 'placeOfUse' },
				],
			},
		],
		order: [['createdAt', 'DESC']],
	});

	if (!purchaseOrder) {
		return res.status(404).json({ message: 'Purchase order not found' });
	}

	// const serialsData = await ProductSerial.findAll();
	// const batchData = await ProductBatch.findAll();

	// Convert to plain object first
	const poDetail = purchaseOrder.get({ plain: true });

	const chargeRows = await documentChargesRepository.getForDocument(DOCUMENT_TYPE, id);
	// Pre-existing PO created before this engine has zero document_charges rows — reconstruct
	// equivalent charges from its legacy customFields so it renders/edits consistently rather
	// than silently losing them.
	const charges = chargeRows.length > 0
		? dbRowsToCharges(chargeRows)
		: legacyCustomFieldsToCharges(poDetail.customFields);

	const response = {
		...poDetail,
		charges,
		productItems: poDetail.items.map((item) => ({
			...item,
			item_type: item.productSnapshot.item_type,
			product_name: item.productSnapshot.name,
			// batches: item.productSnapshot.stock_type === 'batch' ? batchData : [],
			batches: [],
			serials: [],
			// serials: serialsData.map((s) => ({
			// 	...s,
			// 	label: s.serial_no,
			// 	value: s.id.toString(),
			// 	key: s.id.toString(),
			// })),
			// selectedSerials: item.serials?.map((serial) => serial.serial_no) || [],
			// stockQty: (() => {
			// 	if (item.stock_type === 'normal') {
			// 		return item.product.available_qty || 1;
			// 	} else if (item.stock_type === 'batch') {
			// 		return batchData ? batchData.length : 0;
			// 	} else if (item.stock_type === 'serial') {
			// 		// const totalSerials = serialsData.filter(
			// 		// 	(s) => s.product_id === item.product_id && s.is_sell === 0
			// 		// ).length;
			// 		return serialsData ? serialsData.length : 0;
			// 	}
			// 	return 0;
			// })(),
			stockQty: item.qty,
		})),
		additionalRemarks: poDetail.remarks,
	};

	return response;
};

exports.deletePurchaseOrder = async (req) => {
	const { id } = req.params;
	const { org_id, role } = req.user;

	// auth: user must have org_id OR be Admin
	if (!org_id && role !== 'Admin') {
		throw new AppError(`You don't authorize to access this api.`, 403);
	}

	// start transaction
	const transaction = await sequelize.transaction();

	try {
		logger.warn('First');
		const purchaseOrder = await purchaseOrderRepository.findById(id, {
			include: [{ model: PurchaseOrderItem, as: 'items' }],
			transaction,
		});
		logger.warn('second');
		if (!purchaseOrder) {
			await transaction.rollback();
			logger.warn('Purchase Order not found for delete', { id });
			throw new AppError('Purchase Order not found', StatusCodes.NOT_FOUND);
		}
		logger.warn('third');

		// Same guard updatePurchaseOrder uses when a line item is removed from the
		// payload (see the idsToRemove block above) — applied here to every item on
		// the PO, since deleting the whole PO is exactly that same destructive case.
		// GRN items CASCADE off PurchaseOrderItem; QC/Purchase Invoice/Short Close
		// items hold po_wo_item_id as a plain polymorphic int with no FK, so the DB
		// would not stop any of this from silently vanishing — including, for GRN,
		// receipts that have already updated VCP's stock ledger.
		const itemIds = purchaseOrder.items.map((item) => item.id);
		if (itemIds.length > 0) {
			const [grnCount, qcCount, invoiceCount, shortCloseCount] = await Promise.all([
				GoodsReceiptNoteItem.count({ where: { purchase_order_item_id: { [Op.in]: itemIds } }, transaction }),
				QcInspectionItem.count({ where: { po_wo_item_id: { [Op.in]: itemIds } }, transaction }),
				PurchaseInvoiceItem.count({ where: { po_wo_item_id: { [Op.in]: itemIds } }, transaction }),
				ShortCloseRequestItem.count({ where: { po_wo_item_id: { [Op.in]: itemIds } }, transaction }),
			]);
			if (grnCount > 0) {
				await transaction.rollback();
				throw new AppError(
					'Cannot delete this Purchase Order because it already has MRN (goods receipt) records against it, which have already updated stock in VCP. Cancel or reverse those MRNs first.',
					StatusCodes.CONFLICT,
				);
			}
			if (qcCount > 0) {
				await transaction.rollback();
				throw new AppError(
					'Cannot delete this Purchase Order because it already has Quality Control inspection records against it. Cancel those QC inspections first.',
					StatusCodes.CONFLICT,
				);
			}
			if (invoiceCount > 0) {
				await transaction.rollback();
				throw new AppError(
					'Cannot delete this Purchase Order because a Purchase Invoice has already been raised against it. Cancel/reject that invoice first.',
					StatusCodes.CONFLICT,
				);
			}
			if (shortCloseCount > 0) {
				await transaction.rollback();
				throw new AppError(
					'Cannot delete this Purchase Order because a Short Close request already exists against it.',
					StatusCodes.CONFLICT,
				);
			}
		}

		// A Payment Requisition already raised against this PO is real financial history —
		// it must be deleted/rejected through its own guarded flow (which itself blocks
		// once TDS liability exists) rather than silently destroyed here.
		const paymentRequisitionCount = await PaymentRequisition.count({ where: { po_id: id }, transaction });
		if (paymentRequisitionCount > 0) {
			await transaction.rollback();
			throw new AppError(
				'Cannot delete this Purchase Order because one or more Payment Requisitions have already been raised against it. Delete or reject those payment requisitions first.',
				StatusCodes.CONFLICT,
			);
		}

		// Only restore indent qty if the PO was submitted (delta was applied on submit).
		if (purchaseOrder.status !== 'draft') {
			for (const item of purchaseOrder.items) {
				await applyIndentQtyDelta(
					parseFloat(item.qty),
					purchaseOrder.indent_id,
					item.product_id,
					item.selected_uom_id ?? null,
					transaction,
					{ req, source: 'po_deleted', sourceRefId: purchaseOrder.id },
				);
			}
		}
		logger.warn('fourth');
		await documentChargesRepository.bulkReplaceForDocument(DOCUMENT_TYPE, id, [], { transaction });
		logger.warn('five');
		const orderFileKeys = await orderDispatchService.deleteAllForDocument(DOCUMENT_TYPE, id, transaction);
		await purchaseOrderRepository.delete(purchaseOrder, { transaction });

		logger.info('Purchase Order deleted', { id });
		logger.warn('six');
		await transaction.commit();
		await orderDispatchService.cleanupS3Documents(orderFileKeys);
		return true;
	} catch (error) {
		if (transaction && !transaction.finished) {
			try {
				logger.warn('First', {error});
				await transaction.rollback();
				return false;
			} catch (rbErr) {
				console.error('rollback error', rbErr);
				throw rbErr;
			}
		}
		throw error;
	}
};

// Apply a base-unit delta to every IndentItem row for a product, scaling each row's
// delta by its own uomSnapshot.qty so that qty_for_purchase_order stays in that row's UOM.
async function applyIndentQtyDelta(uomDelta, indent_id, product_id, uom_id, transaction, meta = {}) {
	const isBaseUnit = uom_id === null || uom_id === undefined || Number(uom_id) === 0;
	const row = await IndentItem.findOne({
		where: {
			indent_id,
			product_id,
			uom_id: isBaseUnit ? { [Op.or]: [null, 0] } : uom_id,
		},
		transaction,
	});
	logger.debug("applyIndentQtyDelta", {row});
	if (!row) return;
	const previousValue = parseFloat(row.qty_for_purchase_order || 0);
	await IndentItemRepository.increment(
		{ qty_for_purchase_order: uomDelta },
		{ where: { id: row.id }, transaction },
	);
	if (meta.source) {
		await indentQtyLogService.record({
			req: meta.req,
			indentItemId: row.id,
			indentId: indent_id,
			productId: product_id,
			field: 'qty_for_purchase_order',
			delta: uomDelta,
			previousValue,
			newValue: previousValue + uomDelta,
			source: meta.source,
			sourceRefId: meta.sourceRefId,
			transaction,
		});
	}
}
// Exported for short-close.service.js — Short Close approval releases qty back to the indent
// via this exact function (positive delta), reusing the one lookup/increment logic PO
// create/update/delete already trust rather than a second, possibly-divergent implementation.
exports.applyIndentQtyDelta = applyIndentQtyDelta;

function validateItemsLimits(productItems, budgetType) {
	// Reject same product + same UOM (different UOM for the same product is allowed).
	const uomSeen = new Set();
	for (const item of productItems) {
		const uomKey = `${item.product_id}:${item.selected_uom_id ?? 'base'}`;
		if (uomSeen.has(uomKey)) {
			const name = item.productSnapshot?.name || `product ${item.product_id}`;
			throw new AppError(
				`${name}: duplicate UOM — each product may appear only once per UOM on a PO`,
			);
		}
		uomSeen.add(uomKey);
	}

	// Value-wise indents are controlled by amount, not qty — skip the qty cap.
	if (budgetType === 'value-wise') return;

	// Group items by product; sum their base-unit qty (selected qty / uomSnapshot.qty).
	// qty_for_purchase_order is stored in each row's own UOM, so divide by uomQty to get base.
	const byProduct = {};
	for (const item of productItems) {
		const uomQty = parseFloat(item.uomSnapshot?.qty) || 1;
		const baseQty = parseFloat(item.qty) / uomQty;
		const key = String(item.product_id);
		if (!byProduct[key]) {
			byProduct[key] = {
				name: item.productSnapshot?.name || `product ${item.product_id}`,
				limit: Number(item.qty_for_purchase_order) / uomQty,
				totalBaseQty: 0,
			};
		}
		byProduct[key].totalBaseQty += baseQty;
	}
	for (const { name, limit, totalBaseQty } of Object.values(byProduct)) {
		if (totalBaseQty > limit) {
			throw new AppError(
				`${name}: total base-unit qty ${totalBaseQty.toFixed(3)} exceeds available indent qty ${limit}`,
			);
		}
	}
}

function checkForDuplicateSerials(productItems) {
	const serialSet = new Set();
	const duplicateSerials = [];
	for (const item of productItems) {
		if (item.stock_type === 'serial' && item.selectedSerials) {
			for (const serial of item.selectedSerials) {
				if (serialSet.has(serial)) {
					duplicateSerials.push(serial);
					return { status: true, duplicateSerials }; // Duplicate found
				}
				serialSet.add(serial);
			}
		}
	}
	return { status: false, duplicateSerials }; // No duplicates
}

// Landscape is only actually needed for a same-state PO — CGST+SGST split doubles the item
// table's tax columns (4 vs IGST's 2), which is what pushes portrait A4 past its printable
// width; an inter-state PO's narrower table fits portrait fine. See htmlPdfGenerator.js.
exports.getSameState = async (id) => {
	const po = await purchaseOrderRepository.findById(id, { attributes: ['same_state'] });
	return Boolean(po?.same_state);
};

exports.generateInvoiceHtml = async (req) => {
	try {
		const { id } = req.params;
		const { copies = [], groupByProductGroup = false } = req.body;

		const purchaseOrder = await purchaseOrderRepository.findById(id, {
			include: [
				{
					model: PurchaseOrderItem,
					as: 'items',
				},
				{ model: MasterTermsCondition, as: 'priceTerm' },
				{ model: MasterTermsCondition, as: 'gstTerm' },
				{ model: MasterTermsCondition, as: 'paymentTerm' },
				{ model: MasterTermsCondition, as: 'deliveryTerm' },
				{ model: MasterTermsCondition, as: 'pfTerm' },
				{ model: MasterTermsCondition, as: 'ldClauseTerm' },
				{ model: Indent, as: 'indent', include: [{ model: MasterUnit, as: 'unit' }, { model: MasterPlaceOfUse, as: 'placeOfUse' }] },
			],
		});

		if (!purchaseOrder)
			return res.status(404).json({ message: 'Purchase order not found' });

		const response = await calculateSaleInvoice(purchaseOrder, req);
		response.groupByProductGroup = Boolean(groupByProductGroup);
		logger.debug('response ', response);
		// return
		const copyTitles = {
			original: 'ORIGINAL FOR RECIPIENT',
			duplicate: 'DUPLICATE COPY',
			transport: 'DUPLICATE FOR TRANSPORTER',
			office: 'TRIPLICATE FOR SUPPLIER',
		};

		if (copies.length === 0) copies.push('original'); // default

		const htmlParts = await Promise.all(
			copies.map((copy) => {
				const title = copyTitles[copy] || 'INVOICE COPY';
				return generateInvoiceHTML({ ...response, copyTitle: title }, 'defaultTemplate');
			}),
		);

		const combinedHtml = htmlParts
			.map((html) => `<div class="preview-page">\n${html}\n</div>`)
			.join('\n');

		return combinedHtml;
	} catch (err) {
		console.error(err);
		throw new AppError('Failed to generate HTML');
	}
};

async function calculateSaleInvoice(invoice, req) {
	// const serialsData = await ProductSerial.findAll();
	// const batchData = await ProductBatch.findAll();
	const invoiceData = invoice.get({ plain: true });

	// PO items only carry a productSnapshot captured at creation time (no product-group
	// data), so group membership for the printable preview is fetched fresh from
	// vcp-service per distinct product_id.
	const productGroupsMap = await fetchProductGroupsByIds(
		req,
		invoiceData.items.map((item) => item.product_id),
	);

	// return;
	const totalTaxableAmount = invoiceData.items.reduce((sum, item) => {
		const priceAfterDiscount =
			item.discount_price_type === 'percentage'
				? item.price - (item.price * item.discount) / 100
				: item.price - item.discount;
		return sum + priceAfterDiscount * parseFloat(item.qty);
	}, 0);

	const totalCgst = invoiceData.same_state
		? invoiceData.items.reduce(
				(sum, item) => sum + parseFloat(item.cgst || 0),
				0,
			)
		: 0;
	const totalSgst = invoiceData.same_state
		? invoiceData.items.reduce(
				(sum, item) => sum + parseFloat(item.sgst || 0),
				0,
			)
		: 0;
	const totalIgst = !invoiceData.same_state
		? invoiceData.items.reduce(
				(sum, item) => sum + parseFloat(item.igst || 0),
				0,
			)
		: 0;

	// Charges (contingency/freight/packing/etc. configured via the charge-tax engine) —
	// folded into the same CGST/SGST/IGST totals the items contribute to, so the printed
	// breakdown always sums to the document's actual total_tax, and rendered as their own
	// line items so the printed document discloses what they were.
	const chargeRows = await documentChargesRepository.getForDocument(DOCUMENT_TYPE, invoiceData.id);
	const charges = chargeRows.map((row) => ({
		name: row.name,
		calculationType: row.calculation_type,
		value: parseFloat(row.value),
		operation: row.operation,
		applyOn: row.apply_on,
		taxTreatment: row.tax_treatment,
		taxableAmount: parseFloat(row.taxable_amount),
		cgst: parseFloat(row.cgst),
		sgst: parseFloat(row.sgst),
		igst: parseFloat(row.igst),
		total: parseFloat(row.total),
	}));
	const totalCgstWithCharges = totalCgst + charges.reduce((sum, c) => sum + c.cgst, 0);
	const totalSgstWithCharges = totalSgst + charges.reduce((sum, c) => sum + c.sgst, 0);
	const totalIgstWithCharges = totalIgst + charges.reduce((sum, c) => sum + c.igst, 0);

	const [state, userData] = await Promise.all([
		getState(invoiceData.vendorInfo.state_id),
		User.findOne({
			where: { org_id: invoiceData.org_id },
			include: [
				{
					model: organization,
					as: 'organization',
				},
				{
					model: Role,
					as: 'userRoles',
					through: { attributes: [] },
					attributes: ['id', 'name', 'code'],
					where: { code: 'org_admin' },
				},
			],
		}),
	]);

	let businessLogo = null;
	let business = null;
	const unit = invoiceData.indent?.unit;
	if (unit) {
		business = {
			org_name: unit.unit_name || unit.unitName || '',
			city: unit.city,
			pincode: unit.pincode,
			org_gst_number: unit.gstin,
			org_email: unit.company_email,
		};
		const unitAddressLine = [unit.address1, unit.address2, unit.landmark].filter(Boolean).join(', ');
		business.address = `${unitAddressLine ? `${unitAddressLine},<br>` : ''}
			${unit.city || ''} - ${unit.pincode || ''}, ${unit.state || ''}<br>`;
	} else if (userData) {
		business = userData.organization;
		business.address = `${business.org_address || ''},<br>
			${business.city || ''} - ${business.pincode || ''}, ${
				business?._state?.state_name || ''
			}<br>`;
	}
	if (userData?.logo) {
		businessLogo = await getImageAsBase64DataUrl(userData.logo);
	}
	console.log('invoiceData.items ', invoiceData.items);
	const orderReferenceNote =
		'With reference to your quotation we are pleased to place an order with you for the supply of the undernoted materials as per instructions specified below subject to general terms and conditions as mentioned below.';
	const response = {
		...invoiceData,
		businessLogo,
		business,
		orderReferenceNote,
		dueDate: formatExportDate(invoiceData.dueDate),
		poDetail: {
			...invoiceData.poDetail,
			date: formatExportDate(invoiceData.poDetail?.date),
		},
		vendorInfo: {
			...invoiceData.vendorInfo,
			state_name: `${state?.state_name} (${state?.gst_code})` || 'N/A',
		},
		productItems: invoiceData.items.map((item) => {
			const snapshot = item.productSnapshot;
			console.log('snapshot ', snapshot);
			return {
				...item,
				item_type: snapshot.item_type,
				product_name: snapshot.name,
				product_groups: productGroupsMap.get(item.product_id) || [],
				batches: [],
				// serials: serialsData?.map((s) => ({
				// 	...s,
				// 	label: s.serial_no,
				// 	value: s.id.toString(),
				// 	key: s.id.toString(),
				// })) || [],
				// selectedSerials: item.serials?.map((serial) => serial.serial_no) || [],
				// stockQty: (() => {
				// 	if (item.productSnapshot.stock_type === 'normal') {
				// 		return item.product.available_qty || 1;
				// 	} else if (item.productSnapshot.stock_type === 'batch') {
				// 		return batchData ? batchData.length : 0;
				// 	} else if (item.productSnapshot.stock_type === 'serial') {
				// 		// const totalSerials = serialsData.filter(
				// 		// 	(s) => s.product_id === item.product_id && s.is_sell === 0
				// 		// ).length;
				// 		return serialsData ? serialsData.length : 0;
				// 	}
				// 	return 0;
				// })(),
				taxRate: (() => {
					const rate = item.taxSnapshot?.rate ?? item.tax?.rate;
					if (invoiceData.same_state) {
						return rate ? rate / 2 : '0';
					} else {
						return rate ?? '0';
					}
				})(),
				totalTaxable: (() => {
					const priceAfterDiscount =
						item.discount_price_type === 'percentage'
							? item.price - (item.price * item.discount) / 100
							: item.price - item.discount;
					return parseFloat(priceAfterDiscount * item.qty).toFixed(2);
				})(),
				itemDiscountPercentage: (() => {
					if (item.discount_price_type === 'percentage') {
						return parseFloat(item.discount).toFixed(2);
					} else if (item.discount_price_type === 'rupee') {
						const discountPercent = (item.discount / item.price) * 100 || 0;
						return parseFloat(discountPercent).toFixed(2);
					}
					return '0.00';
				})(),
				uomDisplay: item.uomSnapshot?.unit?.name || item.uomSnapshot?.unit?.code || item.productSnapshot?.baseUnit?.name || item.productSnapshot?.baseUnit?.code || 'N/A',
			};
		}),
		additionalRemarks: invoiceData.remarks,
		combineInvoiceNumber: invoiceData.doc_number || `${invoiceData.poPrefix || ''}${
			invoiceData.poNo || ''
		}${invoiceData.poPostfix || ''}`,
		totalCgst: totalCgstWithCharges,
		totalSgst: totalSgstWithCharges,
		totalIgst: totalIgstWithCharges,
		charges,
		totalDiscountAmount: invoiceData.items.reduce((sum, item) => {
			if (item.discount_price_type === 'percentage') {
				const discountAmount =
					((item.price * item.discount) / 100) * parseFloat(item.qty);
				return sum + discountAmount;
			} else if (item.discount_price_type === 'rupee') {
				const discountAmount = parseFloat(item.discount) * parseFloat(item.qty);
				return sum + discountAmount;
			}
			return sum;
		}, 0),
		totalQuantity: invoiceData.items.reduce(
			(sum, item) => sum + parseFloat(item.qty),
			0,
		),
		totalTaxableAmount,
		customField1: (() => {
			const field = invoiceData.customFields[0];
			if (!field) return null;

			let baseAmount =
				totalTaxableAmount +
				(invoiceData.same_state ? totalCgst + totalSgst : totalIgst);

			let calculatedValue = 0;
			if (field.valueType === 'percentage') {
				calculatedValue = (baseAmount * parseFloat(field.amount || 0)) / 100;
			} else if (field.valueType === 'rupee') {
				calculatedValue = parseFloat(field.amount || 0);
			}

			return {
				label: field.name,
				value: field.amount,
				valueType: field.valueType,
				operationType: field.operationType,
				calculatedValue: calculatedValue.toFixed(2),
			};
		})(),
		customField2: (() => {
			const field = invoiceData.customFields[1];
			if (!field) return null;

			let baseAmount =
				totalTaxableAmount +
				(invoiceData.same_state ? totalCgst + totalSgst : totalIgst);

			let calculatedValue = 0;
			if (field.valueType === 'percentage') {
				calculatedValue = (baseAmount * parseFloat(field.amount || 0)) / 100;
			} else if (field.valueType === 'rupee') {
				calculatedValue = parseFloat(field.amount || 0);
			}

			return {
				label: field.name,
				value: field.amount,
				valueType: field.valueType,
				operationType: field.operationType,
				calculatedValue: calculatedValue.toFixed(2),
			};
		})(),
		termsAndConditions: [
			invoiceData.priceTerm && {
				label: 'Price Term',
				value: invoiceData.priceTerm.terms_type,
			},
			invoiceData.gstTerm && {
				label: 'GST Term',
				value: invoiceData.gstTerm.terms_type,
			},
			invoiceData.paymentTerm && {
				label: 'Payment Term',
				value: invoiceData.paymentTerm.terms_type,
			},
			invoiceData.deliveryTerm && {
				label: 'Delivery Term',
				value: invoiceData.deliveryTerm.terms_type,
			},
			invoiceData.pfTerm && {
				label: 'P&F Term',
				value: invoiceData.pfTerm.terms_type,
			},
			invoiceData.ldClauseTerm && {
				label: 'LD Clause Term',
				value: invoiceData.ldClauseTerm.terms_type,
			},
		].filter(Boolean),
	};

	return response;
}

async function getState(id) {
	const url = `${VCP_SERVICE_API_BASE_URL}states/${id}`;
	console.log('url ', url);

	// const token = req.cookies.accessToken;

	const response = await fetch(url, {
		method: 'GET',
		// headers: {
		// 	Authorization: `Bearer ${token}`,
		// },
	});

	const data = await response.json();

	return data || [];
}

const EXPORT_BATCH_SIZE = 200;

const safeFloat = (val, fallback = 0) => {
	const n = parseFloat(val);
	return isNaN(n) ? fallback : n;
};

const safeStr = (val) => (val == null ? '' : String(val));

const formatExportDate = (val) => {
	if (!val) return '';
	try {
		return new Date(val).toLocaleDateString('en-IN', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
		});
	} catch {
		return '';
	}
};

const formatExportDateTime = (val) => {
	if (!val) return '';
	try {
		return new Date(val).toLocaleString('en-IN', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	} catch {
		return '';
	}
};

const resolveDiscountValue = (discount) => {
	if (discount == null) return 0;
	if (typeof discount === 'object') {
		return safeFloat(
			discount.discount_amount ?? discount.value ?? discount.amount ?? 0,
		);
	}
	return safeFloat(discount);
};

exports.exportPurchaseOrders = async (req) => {
	const { org_id, role } = req.user;

	if (!org_id && role !== 'Admin') {
		throw new AppError("You don't have access to this API.", 403);
	}

	const { andConditions, unitId } = await buildPurchaseOrderFilters(req);
	const whereClause = { [Op.and]: andConditions };

	const now = new Date();
	const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
	const fileName = `purchase_order_report_${ts}.xlsx`;
	const directory = path.join(__dirname,`../../storage/purchase-orders`);

	if(!existsSync(directory)){
		await fs.mkdir(directory, { recursive: true });
	}

	const filePath = path.join(directory, `/${fileName}`);

	// Standard workbook (not streaming) — full styling support including fills/fonts
	const workbook = new ExcelJS.Workbook();

	const YELLOW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFBF00' } };
	const HEADER_FONT = { bold: true, color: { argb: 'FF000000' } };
	const HEADER_ALIGN = { vertical: 'middle', horizontal: 'center', wrapText: true };
	const THIN_BORDER = {
		top: { style: 'thin', color: { argb: 'FF000000' } },
		left: { style: 'thin', color: { argb: 'FF000000' } },
		bottom: { style: 'thin', color: { argb: 'FF000000' } },
		right: { style: 'thin', color: { argb: 'FF000000' } },
	};

	const borderRow = (row, numCols) => {
		for (let c = 1; c <= numCols; c++) {
			row.getCell(c).border = THIN_BORDER;
		}
	};

	const styleHeaderRow = (sheet) => {
		const row = sheet.getRow(1);
		const numCols = sheet.columns.length;
		for (let c = 1; c <= numCols; c++) {
			const cell = row.getCell(c);
			cell.font = HEADER_FONT;
			cell.fill = YELLOW;
			cell.alignment = HEADER_ALIGN;
			cell.border = THIN_BORDER;
		}
		row.height = 22;
	};

	// ── Sheet 1: PO headers ──────────────────────────────────────────────────
	const poSheet = workbook.addWorksheet('Purchase Orders');
	poSheet.columns = [
		{ header: 'Sr. No.', key: 'sr', width: 8 },
		{ header: 'PO No.', key: 'poNo', width: 20 },
		{ header: 'Order Type', key: 'orderType', width: 16 },
		{ header: 'Vendor Name', key: 'vendorName', width: 32 },
		{ header: 'Vendor GSTIN', key: 'vendorGstin', width: 20 },
		// { header: 'Vendor Email', key: 'vendorEmail', width: 28 },
		{ header: 'Vendor Mobile', key: 'vendorMobile', width: 16 },
		{ header: 'PO Date', key: 'poDate', width: 14 },
		{ header: 'Due Date', key: 'dueDate', width: 14 },
		{ header: 'Taxable Amount (₹)', key: 'totalTaxable', width: 20 },
		{ header: 'Total Tax (₹)', key: 'totalTax', width: 16 },
		{ header: 'Discount (₹)', key: 'discount', width: 14 },
		{ header: 'Other Tax (₹)', key: 'otherTax', width: 14 },
		{ header: 'Grand Total (₹)', key: 'grandTotal', width: 18 },
		{ header: 'Total Paid (₹)', key: 'totalPaid', width: 16 },
		{ header: 'Outstanding (₹)', key: 'remaining', width: 16 },
		{ header: 'Payment Status', key: 'paymentStatus', width: 16 },
		{ header: 'Order Status', key: 'status', width: 14 },
		{ header: 'Dispatch Status', key: 'dispatchStatus', width: 16 },
		{ header: 'Acknowledge Status', key: 'acknowledgeStatus', width: 18 },
		{ header: 'Last Dispatch Date', key: 'lastDispatchedAt', width: 20 },
		{ header: 'Last Acknowledge Date', key: 'lastAcknowledgedAt', width: 22 },
		{ header: 'Same State (GST)', key: 'sameState', width: 18 },
		{ header: 'QC Required', key: 'qcCheck', width: 14 },
		{ header: 'Remarks', key: 'remarks', width: 35 },
		{ header: 'Payment Term (%)', key: 'paymentTermValue', width: 20 },
		{ header: 'Payment Term Amount (₹)', key: 'paymentTermAmount', width: 24 },
		{ header: 'Start Date', key: 'startDate', width: 14 },
		{ header: 'End Date', key: 'endDate', width: 14 },
		{ header: 'Retention (%)', key: 'retention', width: 14 },
		{ header: 'Retention Amount (₹)', key: 'retentionAmount', width: 22 },
		{ header: 'Created At', key: 'createdAt', width: 20 },
	];
	styleHeaderRow(poSheet);

	// ── Sheet 2: Line items ──────────────────────────────────────────────────
	const itemSheet = workbook.addWorksheet('Line Items');
	itemSheet.columns = [
		{ header: 'Sr. No.', key: 'sr', width: 8 },
		{ header: 'PO No.', key: 'poNo', width: 20 },
		{ header: 'Order Type', key: 'orderType', width: 16 },
		{ header: 'Vendor Name', key: 'vendorName', width: 32 },
		{ header: 'Product Name', key: 'productName', width: 38 },
		{ header: 'Product Code', key: 'productCode', width: 18 },
		{ header: 'HSN / SAC Code', key: 'hsnCode', width: 18 },
		{ header: 'UOM', key: 'uom', width: 12 },
		{ header: 'Qty', key: 'qty', width: 10 },
		{ header: 'Rate (₹)', key: 'price', width: 14 },
		{ header: 'Discount', key: 'discount', width: 12 },
		{ header: 'Discount Type', key: 'discountType', width: 14 },
		{ header: 'IGST (%)', key: 'igst', width: 12 },
		{ header: 'CGST (%)', key: 'cgst', width: 12 },
		{ header: 'SGST (%)', key: 'sgst', width: 12 },
		{ header: 'CESS (%)', key: 'cess', width: 12 },
		{ header: 'Line Total (₹)', key: 'total', width: 16 },
		{ header: 'Budget No.', key: 'budgetNo', width: 16 },
		{ header: 'Note', key: 'note', width: 28 },
		{ header: 'Specification', key: 'specification', width: 28 },
	];
	styleHeaderRow(itemSheet);

	const poColCount = poSheet.columns.length;
	const itemColCount = itemSheet.columns.length;

	// ── Paginated DB fetch ───────────────────────────────────────────────────
	let offset = 0;
	let poSrNo = 1;
	let itemSrNo = 1;

	for (;;) {
		const batch = await PurchaseOrder.findAll({
			where: whereClause,
			attributes: [
				'id', 'poPrefix', 'poNo', 'poPostfix', 'doc_number', 'poDetail', 'vendorInfo',
				'dueDate', 'grandTotal', 'total_taxable', 'total_tax', 'discount',
				'otherTax', 'totalPaid', 'remainingAmount', 'paymentStatus', 'status',
				'dispatch_status', 'last_dispatched_at', 'last_acknowledged_at',
				'same_state', 'po_qc_check', 'orderType', 'start_date', 'end_date',
				'retention', 'retention_amount', 'remarks',
				'payment_term_value', 'payment_term_amount', 'createdAt',
			],
			include: [
				{
					model: PurchaseOrderItem,
					as: 'items',
					attributes: [
						'productSnapshot', 'uomSnapshot', 'hsn_sac_code',
						'qty', 'price', 'discount', 'discount_price_type',
						'igst', 'cgst', 'sgst', 'cess', 'total',
						'note', 'specification', 'budget_no',
					],
				},
				{
					model: Indent,
					as: 'indent',
					attributes: [],
					where: unitId ? { unit_id: unitId } : undefined,
					required: !!unitId,
				},
			],
			order: [['createdAt', 'DESC']],
			limit: EXPORT_BATCH_SIZE,
			offset,
		});

		if (!batch || batch.length === 0) break;

		for (const poInstance of batch) {
			const po = poInstance.get({ plain: true });

			const poNumber = po.doc_number || `${safeStr(po.poPrefix)}${safeStr(po.poNo)}${safeStr(po.poPostfix)}`;
			const vendorInfo = po.vendorInfo ?? {};
			const vendorName = safeStr(vendorInfo.vendor_name ?? vendorInfo.name ?? '');
			const vendorGstin = safeStr(vendorInfo.gstin ?? vendorInfo.gst_no ?? '');
			// const vendorEmail = safeStr(vendorInfo.email ?? '');
			const vendorMobile = safeStr(vendorInfo.contactNo ?? vendorInfo.phone ?? '');
			const poDetail = po.poDetail ?? {};
			const poDate = formatExportDate(poDetail.date ?? po.createdAt);
			const orderTypeLabel = safeStr(po.orderType ?? '').replace(/_/g, ' ').toUpperCase();
			const discountAmt = resolveDiscountValue(po.discount);
			const otherTaxAmt = resolveDiscountValue(po.otherTax);

			borderRow(poSheet.addRow({
				sr: poSrNo++,
				poNo: poNumber,
				orderType: orderTypeLabel,
				vendorName,
				vendorGstin,
				// vendorEmail,
				vendorMobile,
				poDate,
				dueDate: formatExportDate(po.dueDate),
				totalTaxable: safeFloat(po.total_taxable),
				totalTax: safeFloat(po.total_tax),
				discount: discountAmt,
				otherTax: otherTaxAmt,
				grandTotal: safeFloat(po.grandTotal),
				totalPaid: safeFloat(po.totalPaid),
				remaining: safeFloat(po.remainingAmount),
				paymentStatus: safeStr(po.paymentStatus),
				status: safeStr(po.status).toUpperCase(),
				dispatchStatus: po.dispatch_status === 'not_dispatched' ? 'Not Dispatched' : 'Dispatched',
				acknowledgeStatus: { not_dispatched: '—', dispatched: 'Pending', acknowledged: 'Acknowledged' }[po.dispatch_status] ?? '—',
				lastDispatchedAt: formatExportDateTime(po.last_dispatched_at),
				lastAcknowledgedAt: formatExportDateTime(po.last_acknowledged_at),
				sameState: po.same_state ? 'Yes' : 'No',
				qcCheck: po.po_qc_check ? 'Yes' : 'No',
				remarks: safeStr(po.remarks),
				paymentTermValue: po.payment_term_value != null ? safeFloat(po.payment_term_value) : '',
				paymentTermAmount: po.payment_term_amount != null ? safeFloat(po.payment_term_amount) : '',
				startDate: formatExportDate(po.start_date),
				endDate: formatExportDate(po.end_date),
				retention: po.retention != null ? safeFloat(po.retention) : '',
				retentionAmount: po.retention_amount != null ? safeFloat(po.retention_amount) : '',
				createdAt: formatExportDateTime(po.createdAt),
			}), poColCount);

			for (const item of (po.items ?? [])) {
				const snap = item.productSnapshot ?? {};
				const uomSnap = item.uomSnapshot ?? {};
				const productName = safeStr(snap.name ?? '');
				const productCode = safeStr(snap.uniqueProductId ?? snap.product_code ?? snap.sku ?? '');
				const hsnCode = safeStr(item.hsn_sac_code ?? snap.hsn_code ?? snap.hsn_sac_code ?? '');
				const uomCode = safeStr(uomSnap.unit?.name ?? uomSnap.unit?.code ?? uomSnap.code ?? uomSnap.name ?? uomSnap.short_name ?? snap.baseUnit?.name ?? snap.baseUnit?.code ?? '');

				borderRow(itemSheet.addRow({
					sr: itemSrNo++,
					poNo: poNumber,
					orderType: orderTypeLabel,
					vendorName,
					productName,
					productCode,
					hsnCode,
					uom: uomCode,
					qty: safeFloat(item.qty),
					price: safeFloat(item.price),
					discount: safeFloat(item.discount),
					discountType: safeStr(item.discount_price_type ?? ''),
					igst: safeFloat(item.igst),
					cgst: safeFloat(item.cgst),
					sgst: safeFloat(item.sgst),
					cess: safeFloat(item.cess),
					total: safeFloat(item.total),
					budgetNo: safeStr(item.budget_no ?? ''),
					note: safeStr(item.note ?? ''),
					specification: safeStr(item.specification ?? ''),
				}), itemColCount);
			}
		}

		offset += EXPORT_BATCH_SIZE;
		if (batch.length < EXPORT_BATCH_SIZE) break;
	}

	if (poSrNo === 1) {
		throw new AppError('No purchase orders found to export.', StatusCodes.NOT_FOUND);
	}

	await workbook.xlsx.writeFile(filePath);

	const baseUrl = BASE_URL || 'http://localhost:4300';
	return {
		fileName,
		path: `${baseUrl}/storage/purchase-orders/${fileName}`,
	};
};

exports.submitPurchaseOrder = async (req, id) => {
	const po = await fetchPurchaseOrderForWorkflow(id);
	if (po.status !== 'draft') {
		throw new AppError('Only draft Purchase Orders can be submitted for approval', StatusCodes.BAD_REQUEST);
	}

	const transaction = await sequelize.transaction();
	try {
		// Authoritative check: submit is the actual commitment point for a value-wise budget
		// (a draft PO has deducted nothing — see applyIndentQtyDelta below, which only ever
		// runs from here / updatePurchaseOrder's wasSubmitted branch / delete's restore path).
		// Re-validating here, under the IndentItem row lock, is what closes the race where two
		// draft POs against the same over-committed indent line both passed the advisory
		// create/update-time check (which only sums OTHER already-submitted POs) and then both
		// get submitted concurrently.
		await validateDocumentAgainstIndentBudget({
			indent_id: po.indent_id,
			lines: po.items.map((item) => ({
				product_id: item.product_id,
				uom_id: item.selected_uom_id,
				taxableAmount: taxableAmountOf(item),
			})),
			matchUom: true,
			documentLabel: 'this Purchase Order',
			transaction,
		});

		// Authoritative budget-level commitment check (charges + non-recoverable tax), under the
		// Budget row lock(s), before this PO's own status flips out of 'draft' — once it does,
		// getCommittedBudgetImpact would count it as already committed.
		await validateBudgetCommitment({
			components: await componentsForStoredDocument(DOCUMENT_TYPE, po, { transaction, netOfShortClose: false }),
			documentType: DOCUMENT_TYPE,
			excludeDocumentId: po.id,
			documentLabel: 'this Purchase Order',
			enforce: true,
			transaction,
		});

		const instance = await workflowEngine.startInstance({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: po.id,
			orgId: po.org_id,
			transaction,
		});

		await po.update({ status: instance.status }, { transaction });

		for (const item of po.items) {
			logger.debug("PO Item Qty Deduction", {
				qty: -parseFloat(item.qty),
				indent_id: po.indent_id,
				product_id: item.product_id,
				selected_uom_id: item.selected_uom_id ?? null,
			});
			await applyIndentQtyDelta(
				-parseFloat(item.qty),
				po.indent_id,
				item.product_id,
				item.selected_uom_id ?? null,
				transaction,
				{ req, source: 'po_submitted', sourceRefId: po.id },
			);
		}

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: id,
			action: 'submitted',
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchPurchaseOrderForWorkflow(id);
};

exports.approvePurchaseOrder = async (req, id, remarks) => {
	const po = await fetchPurchaseOrderForWorkflow(id);
	await poWorkflow.assertCanAct(req, po);

	const stageNameBeforeAction = (
		await workflowEngine.getInstanceWithStages({ documentType: DOCUMENT_TYPE, documentId: id })
	).instance.currentStage?.stage_name ?? null;

	const transaction = await sequelize.transaction();
	try {
		const instance = await workflowEngine.advanceStage({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: id,
			action: 'approved',
			transaction,
		});

		await po.update(
			{
				status: instance.status,
				approved_by: { id: req.user.id, name: req.user.name, email: req.user.email },
				approved_at: new Date(),
			},
			{ transaction },
		);

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: id,
			action: 'approved',
			remarks,
			workflowStageName: stageNameBeforeAction,
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchPurchaseOrderForWorkflow(id);
};

exports.rejectPurchaseOrder = async (req, id, remarks) => {
	return poWorkflow.reject(req, id, remarks);
};

exports.cancelPurchaseOrder = async (req, id, remarks) => {
	if (!remarks || !remarks.trim()) {
		throw new AppError('A cancellation reason is required', StatusCodes.BAD_REQUEST);
	}

	const po = await fetchPurchaseOrderForWorkflow(id);

	// Draft POs have no workflow instance (never submitted) — cancel directly
	if (po.status === 'draft') {
		const transaction = await sequelize.transaction();
		try {
			await po.update({ status: 'cancelled', cancellation_remarks: remarks }, { transaction });
			await auditLogService.record({
				req,
				entityType: DOCUMENT_TYPE,
				entityId: id,
				action: 'cancelled',
				remarks,
				transaction,
			});
			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			throw error;
		}
		return fetchPurchaseOrderForWorkflow(id);
	}

	return poWorkflow.cancel(req, id, remarks);
};

exports.reopenPurchaseOrder = async (req, id, remarks) => {
	return poWorkflow.reopen(req, id, remarks);
};

exports.archivePurchaseOrder = async (req, id, remarks) => {
	return poWorkflow.archive(req, id, remarks);
};

exports.restorePurchaseOrder = async (req, id, remarks) => {
	return poWorkflow.restore(req, id, remarks);
};

exports.getPurchaseOrderWorkflow = async (req, id) => {
	const workflow = await poWorkflow.getWorkflow(req, id);
	const dispatchHistoryRows = await orderDispatchService.getMergedHistoryRows(DOCUMENT_TYPE, id);
	const history = [...workflow.history, ...dispatchHistoryRows].sort(
		(a, b) => new Date(a.createdAt) - new Date(b.createdAt),
	);
	return { ...workflow, history };
};

/**
 * Renders the same HTML/PDF pipeline `POST /:id/html` + `/:id/pdf` use (see
 * generateInvoiceHtml/generateInvoiceHTMLPDF above), but end-to-end server-side with no
 * frontend round-trip, then reads the saved file back into a Buffer for the dispatch email
 * attachment. `generateInvoiceHTMLPDF` writes to disk and returns a URL, not a Buffer, because
 * its only other caller streams the URL straight to the browser — this is the one place that
 * needs the bytes instead.
 */
async function buildPurchaseOrderPdfBuffer(id) {
	const [html, sameState] = await Promise.all([
		exports.generateInvoiceHtml({ params: { id }, body: {} }),
		exports.getSameState(id),
	]);
	const pdfUrl = await generateInvoiceHTMLPDF(html, 'defaultTemplate', { multi: true, landscape: sameState });
	const relativePath = pdfUrl.split('/storage/')[1];
	if (!relativePath) return null;
	return fs.readFile(path.join(__dirname, '../../storage', relativePath));
}

exports.dispatchPurchaseOrder = async (req, id, payload) => {
	const po = await fetchPurchaseOrderForWorkflow(id);
	if (po.status !== 'approved') {
		throw new AppError('Only approved Purchase Orders can be dispatched', StatusCodes.BAD_REQUEST);
	}

	await orderDispatchService.dispatchDocument({
		req,
		documentType: DOCUMENT_TYPE,
		documentId: id,
		doc: po,
		payload,
		generatePdfBuffer: () => buildPurchaseOrderPdfBuffer(id),
		documentLabel: po.doc_number || `${po.poPrefix || ''}${po.poNo}${po.poPostfix || ''}`,
	});

	return fetchPurchaseOrderForWorkflow(id);
};

exports.acknowledgePurchaseOrder = async (req, id, payload, file) => {
	const po = await fetchPurchaseOrderForWorkflow(id);
	if (po.dispatch_status === 'not_dispatched') {
		throw new AppError('This Purchase Order has not been dispatched yet', StatusCodes.CONFLICT);
	}

	await orderDispatchService.acknowledgeDocument({
		req,
		documentType: DOCUMENT_TYPE,
		documentId: id,
		doc: po,
		payload,
		file,
	});

	return fetchPurchaseOrderForWorkflow(id);
};

exports.listPurchaseOrderDispatches = async (id) => {
	await fetchPurchaseOrderForWorkflow(id);
	return orderDispatchService.listDispatches(DOCUMENT_TYPE, id);
};

exports.listPurchaseOrderAcknowledgements = async (id) => {
	await fetchPurchaseOrderForWorkflow(id);
	return orderDispatchService.listAcknowledgements(DOCUMENT_TYPE, id);
};
