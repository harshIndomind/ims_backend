/**
 * PO/WO Short Close — intentionally settles the remaining unfulfilled qty on a PO/WO line the
 * business no longer expects to receive (see docs/architecture/short-close.md and
 * docs/architecture/short-close-implementation-plan.md).
 *
 * Storage mirrors QC Inspection: short-closed qty is never written onto the PO/WO item itself,
 * only summed from short_close_request_items the same way qc_inspection_items sums
 * accepted_qty (qcInspectionItemsRepository.sumAcceptedQtyForPoWoItem vs. this module's own
 * shortCloseRequestItemsRepository.sumApprovedQtyForPoWoItem). qc-inspection.service.js's
 * getRemainingForDocument is the shared source of truth for "how much is left open on this
 * line" — this module reimplements the identical formula (ordered − Σaccepted −
 * Σapproved-short-close) rather than depending on the QC module directly, to keep the two
 * modules decoupled the way GRN and QC already are.
 *
 * IMPORTANT: approval releases the short-closed qty onto IndentItem.qty_for_purchase_order, NOT
 * balance_indent_qty. qty_for_purchase_order is what validateItemsLimits() in
 * purchase-order.service.js actually checks when a new PO/WO is created — it's the only field
 * that makes "create a follow-up PO for the released qty" possible. balance_indent_qty is a
 * separate, already-manual VCP stock-reissue counter (indentService.reissuePendingQuantity,
 * `POST /indents/:id/reissue`), unrelated to PO/WO creation eligibility. See indentitem.js's
 * column comments and the implementation plan's "Critical Correction" section for the full
 * reasoning — the original task brief assumed balance_indent_qty, which does not work.
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
	ShortCloseRequest,
	ShortCloseRequestItem,
} = require('../models/index');
const { qcInspectionItemsRepository, shortCloseRequestItemsRepository } = require('../repository/index');
const workflowEngine = require('./workflowEngine.service');
const auditLogService = require('./auditLog.service');
const { createWorkflowDocumentService } = require('./workflowDocument.factory');
const { applyIndentQtyDelta } = require('./purchase-order.service');
const { applyIndentQtyDeltaForWorkOrder } = require('./work-order.service');

const DOCUMENT_TYPE = 'short_close_request';

// "Open" = still in flight for the approver to act on — mirrors QC Inspection's
// OPEN_INSPECTION_STATUSES gate (at most one open request per PO/WO document at a time).
const OPEN_STATUSES = ['draft', 'in_progress'];

// Document_type values match qc-inspection.service.js's DOC_CONFIG exactly (purchase_order /
// work_order) — the remaining-qty math in both modules must key off the same strings.
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

function actorSnapshot(user) {
	return user ? { id: user.id, name: user.name, email: user.email } : null;
}

async function fetchRequestOrThrow(id) {
	const request = await ShortCloseRequest.findOne({
		where: { id },
		include: [{ model: ShortCloseRequestItem, as: 'items' }],
	});
	if (!request) {
		throw new AppError(`Short Close Request with ID ${id} not found`, StatusCodes.NOT_FOUND);
	}
	return request;
}

const scWorkflow = createWorkflowDocumentService({
	documentType: DOCUMENT_TYPE,
	fetchById: (id) => fetchRequestOrThrow(id),
});

exports.generateRequestNumber = async (req) => {
	const { org_id } = req.user;
	const latest = await ShortCloseRequest.findOne({ where: { org_id }, order: [['createdAt', 'DESC']] });
	let next = 1;
	if (latest) {
		const latestNumber = parseInt(latest.request_no, 10);
		if (!isNaN(latestNumber)) next = latestNumber + 1;
	}
	return next.toString().padStart(4, '0');
};

// Ordered − Σaccepted (finalized QC) − Σshort_close_qty (approved requests). Same formula as
// qc-inspection.service.js's getRemainingForDocument — kept in sync by hand since the two
// modules are intentionally decoupled (see file header); if you change one, change the other.
async function computeRemainingForItem(item, options = {}) {
	const orderedQty = parseFloat(item.qty);
	const [acceptedQty, shortClosedQty] = await Promise.all([
		qcInspectionItemsRepository.sumAcceptedQtyForPoWoItem(item.id, options),
		shortCloseRequestItemsRepository.sumApprovedQtyForPoWoItem(item.id, options),
	]);
	return {
		ordered_qty: orderedQty,
		accepted_qty: acceptedQty,
		previously_short_closed_qty: shortClosedQty,
		remaining_qty: Math.max(orderedQty - acceptedQty - shortClosedQty, 0),
	};
}
exports.computeRemainingForItem = computeRemainingForItem;

// Drives the PO/WO detail page's "Short Close" action + per-line remaining/short-closed
// columns, and the short-close creation modal's read-only header fields.
exports.getShortCloseableItems = async (req, { document_type, document_id }) => {
	const { org_id } = req.user;
	const config = resolveDocConfig(document_type);
	const doc = await config.model.findOne({
		where: { id: document_id, org_id },
		include: [{ model: config.itemModel, as: 'items' }],
	});
	if (!doc) throw new AppError(`${config.label} not found`, StatusCodes.NOT_FOUND);

	const items = await Promise.all(
		doc.items.map(async (item) => {
			const remaining = await computeRemainingForItem(item);
			return {
				po_wo_item_id: item.id,
				product_id: item.product_id,
				productSnapshot: item.productSnapshot ?? null,
				...remaining,
			};
		}),
	);

	const openRequest = await ShortCloseRequest.findOne({
		where: { document_type, document_id, status: { [Op.in]: OPEN_STATUSES } },
	});

	return {
		document_type,
		document_id,
		has_open_request: Boolean(openRequest),
		open_request_id: openRequest?.id ?? null,
		can_create_request: !openRequest && items.some((i) => i.remaining_qty > 0),
		items,
	};
};

exports.createShortCloseRequest = async (req, body) => {
	const { org_id } = req.user;
	const { document_type, document_id, reason_id, remarks, items } = body;
	const config = resolveDocConfig(document_type);

	if (!Array.isArray(items) || items.length === 0) {
		throw new AppError('At least one item is required', StatusCodes.BAD_REQUEST);
	}

	const doc = await config.model.findOne({
		where: { id: document_id, org_id },
		include: [{ model: config.itemModel, as: 'items' }],
	});
	if (!doc) throw new AppError(`${config.label} not found`, StatusCodes.NOT_FOUND);
	if (['draft', 'rejected', 'cancelled'].includes(doc.status)) {
		throw new AppError(`Cannot short close a ${doc.status} ${config.label}`, StatusCodes.CONFLICT);
	}

	const openRequest = await ShortCloseRequest.findOne({
		where: { document_type, document_id, status: { [Op.in]: OPEN_STATUSES } },
	});
	if (openRequest) {
		throw new AppError(
			'A short close request is already pending approval for this document',
			StatusCodes.CONFLICT,
		);
	}

	const itemsById = new Map(doc.items.map((i) => [i.id, i]));
	const preparedItems = [];
	for (const line of items) {
		const poWoItem = itemsById.get(Number(line.po_wo_item_id));
		if (!poWoItem) {
			throw new AppError(`Item ${line.po_wo_item_id} does not belong to this ${config.label}`, StatusCodes.BAD_REQUEST);
		}
		const qty = parseFloat(line.short_close_qty);
		if (!(qty > 0)) {
			throw new AppError('short_close_qty must be greater than 0', StatusCodes.BAD_REQUEST);
		}

		const remaining = await computeRemainingForItem(poWoItem);
		if (qty > remaining.remaining_qty + 0.001) {
			throw new AppError(
				`${poWoItem.productSnapshot?.name || 'Item'}: short close qty ${qty} exceeds remaining qty ${remaining.remaining_qty}`,
				StatusCodes.UNPROCESSABLE_ENTITY,
			);
		}

		preparedItems.push({
			po_wo_item_id: poWoItem.id,
			product_id: poWoItem.product_id,
			productSnapshot: poWoItem.productSnapshot ?? null,
			ordered_qty: remaining.ordered_qty,
			accepted_qty: remaining.accepted_qty,
			previously_short_closed_qty: remaining.previously_short_closed_qty,
			short_close_qty: qty,
			remarks: line.remarks || null,
		});
	}

	const requestNo = await exports.generateRequestNumber(req);

	let request;
	const transaction = await sequelize.transaction();
	try {
		request = await ShortCloseRequest.create(
			{
				org_id,
				request_no: requestNo,
				document_type,
				document_id,
				reason_id: reason_id ?? null,
				remarks: remarks || null,
				status: 'draft',
				requested_by: actorSnapshot(req.user),
				requested_at: new Date(),
			},
			{ transaction },
		);

		await ShortCloseRequestItem.bulkCreate(
			preparedItems.map((i) => ({ ...i, short_close_request_id: request.id })),
			{ transaction },
		);

		const instance = await workflowEngine.startInstance({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: request.id,
			orgId: org_id,
			transaction,
		});

		await request.update({ status: instance.status }, { transaction });

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: request.id,
			action: 'requested',
			newState: { document_type, document_id, items: preparedItems },
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchRequestOrThrow(request.id);
};

exports.getShortCloseRequest = async (req, id) => fetchRequestOrThrow(id);

exports.listShortCloseRequests = async (req, query = {}) => {
	const { org_id } = req.user;
	const where = { org_id };
	if (query.document_type) where.document_type = query.document_type;
	if (query.document_id) where.document_id = query.document_id;
	if (query.status) where.status = query.status;

	const { limit, offset } = query;
	return ShortCloseRequest.findAndCountAll({
		where,
		include: [{ model: ShortCloseRequestItem, as: 'items' }],
		order: [['createdAt', 'DESC']],
		distinct: true,
		...(limit ? { limit: Number(limit), offset: Number(offset || 0) } : {}),
	});
};

// Recomputes whether every line on the document is now fully settled (accepted + short-closed
// = ordered) and, if so, transitions the PO/WO header to 'completed'. Only fires from a
// document's own 'approved' state — that's the terminal state PO/WO's own approval workflow
// already produces; there is no pre-existing auto-complete-on-full-fulfillment behavior in the
// codebase today (flagged as an open question in the implementation plan), so this is scoped
// deliberately narrow: it only completes a document as a direct result of a Short Close
// approval, not as a side effect of QC/GRN activity alone.
async function maybeCompleteDocument(documentType, documentId, transaction) {
	const config = resolveDocConfig(documentType);
	const doc = await config.model.findOne({
		where: { id: documentId },
		include: [{ model: config.itemModel, as: 'items' }],
		transaction,
	});
	if (!doc || doc.status !== 'approved') return;

	const remainings = await Promise.all(
		doc.items.map((item) => computeRemainingForItem(item, { transaction })),
	);
	const fullySettled = remainings.every((r) => r.remaining_qty <= 0.001);
	if (fullySettled) {
		await doc.update({ status: 'completed' }, { transaction });
	}
}
exports.maybeCompleteDocument = maybeCompleteDocument;

exports.approveShortCloseRequest = async (req, id) => {
	const requestForAssert = await fetchRequestOrThrow(id);
	await scWorkflow.assertCanAct(req, requestForAssert);

	const stageNameBeforeAction = (
		await workflowEngine.getInstanceWithStages({ documentType: DOCUMENT_TYPE, documentId: id })
	).instance.currentStage?.stage_name ?? null;

	const transaction = await sequelize.transaction();
	try {
		// Re-fetch + lock the request row itself so a concurrent/duplicate approve call on the
		// same request can't double-apply (double-click, retry, or two approvers racing).
		const request = await ShortCloseRequest.findOne({
			where: { id },
			include: [{ model: ShortCloseRequestItem, as: 'items' }],
			transaction,
			lock: transaction.LOCK.UPDATE,
		});
		if (!OPEN_STATUSES.includes(request.status)) {
			throw new AppError(`Cannot approve a request with status "${request.status}"`, StatusCodes.CONFLICT);
		}

		const config = resolveDocConfig(request.document_type);
		const doc = await config.model.findOne({
			where: { id: request.document_id },
			include: [{ model: config.itemModel, as: 'items' }],
			transaction,
		});
		if (!doc) throw new AppError(`${config.label} not found`, StatusCodes.NOT_FOUND);

		const itemsById = new Map(doc.items.map((i) => [i.id, i]));

		// Re-validate against CURRENT remaining qty, not the request-creation-time snapshot —
		// another short-close, a fresh QC acceptance, or a concurrently-approved sibling request
		// may have moved it since this request was raised. This is what makes the race in the
		// brief's §20 example ("User A and B both request 15 against a remaining of 20") safe:
		// whichever approval commits first wins; the second re-validates here and fails cleanly.
		for (const line of request.items) {
			const poWoItem = itemsById.get(line.po_wo_item_id);
			if (!poWoItem) continue;
			const remaining = await computeRemainingForItem(poWoItem, { transaction });
			if (parseFloat(line.short_close_qty) > remaining.remaining_qty + 0.001) {
				throw new AppError(
					`Only ${remaining.remaining_qty} remaining for ${poWoItem.productSnapshot?.name || `item ${poWoItem.id}`}; ` +
						`the requested short close of ${line.short_close_qty} can no longer be applied`,
					StatusCodes.CONFLICT,
				);
			}
		}

		const instance = await workflowEngine.advanceStage({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: id,
			action: 'approved',
			transaction,
		});

		await request.update(
			{ status: instance.status, approved_by: actorSnapshot(req.user), approved_at: new Date() },
			{ transaction },
		);

		// Release each line's qty back to the originating IndentItem — no-op if the document has
		// no indent_id, or if applyIndentQtyDelta/applyIndentQtyDeltaForWorkOrder finds no
		// matching IndentItem row, mirroring the existing no-op behavior on PO/WO
		// create/update/delete (see purchase-order.service.js / work-order.service.js).
		if (doc.indent_id) {
			for (const line of request.items) {
				const poWoItem = itemsById.get(line.po_wo_item_id);
				if (!poWoItem) continue;
				const qty = parseFloat(line.short_close_qty);
				if (request.document_type === 'purchase_order') {
					await applyIndentQtyDelta(
						qty,
						doc.indent_id,
						poWoItem.product_id,
						poWoItem.selected_uom_id ?? null,
						transaction,
						{ req, source: 'short_close_released', sourceRefId: request.id },
					);
				} else {
					await applyIndentQtyDeltaForWorkOrder(qty, doc.indent_id, poWoItem.product_id, transaction, {
						req,
						source: 'short_close_released',
						sourceRefId: request.id,
					});
				}
			}

			await auditLogService.record({
				req,
				entityType: 'indent_item',
				entityId: doc.indent_id,
				action: 'released_by_short_close',
				newState: {
					short_close_request_id: request.id,
					document_type: request.document_type,
					document_id: request.document_id,
					released: request.items.map((i) => ({
						po_wo_item_id: i.po_wo_item_id,
						product_id: i.product_id,
						qty: i.short_close_qty,
					})),
				},
				workflowStageName: stageNameBeforeAction,
				transaction,
			});
		}

		await maybeCompleteDocument(request.document_type, request.document_id, transaction);

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

	return fetchRequestOrThrow(id);
};

exports.rejectShortCloseRequest = async (req, id, remarks) => {
	const request = await fetchRequestOrThrow(id);
	if (!OPEN_STATUSES.includes(request.status)) {
		throw new AppError(`Cannot reject a request with status "${request.status}"`, StatusCodes.CONFLICT);
	}
	return scWorkflow.reject(req, id, remarks);
};

exports.cancelShortCloseRequest = async (req, id, remarks) => {
	const request = await fetchRequestOrThrow(id);
	if (request.status === 'approved') {
		throw new AppError('An approved short close request cannot be cancelled', StatusCodes.CONFLICT);
	}
	if (!OPEN_STATUSES.includes(request.status)) {
		throw new AppError(`This request is already ${request.status}`, StatusCodes.CONFLICT);
	}
	return scWorkflow.cancel(req, id, remarks);
};

exports.getShortCloseWorkflow = async (req, id) => scWorkflow.getWorkflow(req, id);
