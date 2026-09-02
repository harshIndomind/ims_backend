/**
 * QC Inspection sits between Acknowledgement and GRN/MRN creation for orders where
 * po_qc_check/wo_qc_check is true. Like Dispatch/Acknowledgement, it's polymorphic over
 * (document_type, document_id) — one service handles both PO and WO.
 *
 * Workflow shape deliberately mirrors PO/WO's own single-stage Maker->Approver pattern rather
 * than a two-stage one: all inspector work (assign/start/save items+checklist) happens BEFORE
 * `submitInspection` — the same "maker fills the whole document, then submits" shape Indent's
 * and PO's own pre-submission editing already uses — so only a single "QC Approver" stage
 * exists in workflow_stages (see seed-qc-inspection-default-workflow.js). Rejection is
 * terminal (no in-place resubmit); fixing a rejected inspection means creating a new one via
 * reinspect(), which keeps the append-only audit trail this codebase relies on elsewhere.
 */
const path = require('path');
const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { Op } = require('sequelize');
const { sequelize } = require('../models/index');
const {
	PurchaseOrder,
	PurchaseOrderItem,
	WorkOrder,
	WorkOrderItem,
	OrderAcknowledgement,
	QcInspection,
	QcInspectionItem,
	QcResult,
	QcTemplate,
	QcTemplateItem,
	MasterQcRejectionReason,
	User,
	Indent,
	MasterUnit,
	Department,
	organization,
	Role,
} = require('../models/index');
const {
	qcInspectionRepository,
	qcInspectionItemsRepository,
	shortCloseRequestItemsRepository,
	orderDocumentRepository,
} = require('../repository/index');
const workflowEngine = require('./workflowEngine.service');
const auditLogService = require('./auditLog.service');
const { createWorkflowDocumentService } = require('./workflowDocument.factory');
const { s3, PutObjectCommand, generateSignedUrl, getImageAsBase64DataUrl } = require('../utils/s3Bucket');
const { generateInvoiceHTML, generateInvoiceHTMLPDF } = require('../pdf/htmlPdfGenerator');

const DOCUMENT_TYPE = 'qc_inspection';

// "Open" = still in flight for an inspector/approver to act on. `completed` and `approved` are
// finalized (saveItems no longer allowed on either — see saveItems' own status guard) and must
// NOT block a new inspection from being created for the next delivery batch; only
// pending/assigned/in_progress genuinely conflict with a fresh one.
const OPEN_INSPECTION_STATUSES = ['pending', 'assigned', 'in_progress'];

const DOC_CONFIG = {
	purchase_order: {
		model: PurchaseOrder,
		itemModel: PurchaseOrderItem,
		qcCheckField: 'po_qc_check',
		label: 'Purchase Order',
	},
	work_order: {
		model: WorkOrder,
		itemModel: WorkOrderItem,
		qcCheckField: 'wo_qc_check',
		label: 'Work Order',
	},
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

async function fetchInspectionForWorkflow(id) {
	const inspection = await QcInspection.findOne({
		where: { id },
		include: [{ model: QcInspectionItem, as: 'items' }],
	});
	if (!inspection) throw new AppError(`QC Inspection with ID ${id} not found`, StatusCodes.NOT_FOUND);
	return inspection;
}

const qcWorkflow = createWorkflowDocumentService({
	documentType: DOCUMENT_TYPE,
	fetchById: (id) => fetchInspectionForWorkflow(id),
});

async function fetchInspectionOrThrow(req, id, options = {}) {
	const { org_id } = req.user;
	const inspection = await QcInspection.findOne({
		where: { id, org_id },
		include: [
			{
				model: QcInspectionItem,
				as: 'items',
				include: [
					{ model: MasterQcRejectionReason, as: 'rejectionReason' },
					{ model: QcResult, as: 'results', include: [{ model: QcTemplateItem, as: 'templateItem' }] },
				],
			},
			{ model: OrderAcknowledgement, as: 'acknowledgement' },
			{ model: QcTemplate, as: 'template', include: [{ model: QcTemplateItem, as: 'items' }] },
			{ model: User, as: 'inspector', attributes: ['id', 'name', 'email'] },
		],
		...options,
	});
	if (!inspection) throw new AppError('QC Inspection not found', StatusCodes.NOT_FOUND);
	return inspection;
}

exports.generateQcNumber = async (req) => {
	const { org_id } = req.user;
	const latest = await QcInspection.findOne({ where: { org_id }, order: [['createdAt', 'DESC']] });

	let next = 1;
	if (latest) {
		const latestNumber = parseInt(latest.qc_no, 10);
		if (!isNaN(latestNumber)) next = latestNumber + 1;
	}
	return next.toString().padStart(4, '0');
};

/**
 * Derives the line items an inspection should start with, straight from the PO/WO's own ordered
 * qty — NOT from the acknowledgement. Acknowledgement only confirms the vendor accepted the
 * PO/WO document; it carries no physical-goods quantity. `current_received_qty` starts at 0 and
 * is filled in by the inspector on the QC screen itself (the actual "goods arrival" moment).
 *
 * Lines that are already fully accepted (Ordered − Σaccepted across prior finalized inspections
 * ≤ 0) are left out entirely — there's nothing left to inspect on that line. If every line is
 * already fulfilled this returns an empty array, which createInspection turns into a hard error.
 */
async function deriveInspectionItems({ doc }) {
	const lines = [];
	for (const item of doc.items) {
		const previouslyAccepted = await qcInspectionItemsRepository.sumAcceptedQtyForPoWoItem(item.id);
		// A line already fully settled via an approved Short Close must not be re-offered for a
		// new inspection either — previously this only checked previouslyAccepted, so a line
		// like ordered 100 / accepted 70 / short-closed 30 (nothing left open) would still get
		// pulled into a fresh inspection, contradicting getRemainingForDocument's own gating
		// (can_create_inspection), which already accounts for short-close.
		const previouslyShortClosed = await shortCloseRequestItemsRepository.sumApprovedQtyForPoWoItem(item.id);
		const orderedQty = parseFloat(item.qty);
		if (orderedQty - previouslyAccepted - previouslyShortClosed <= 0) continue;

		const previouslyReceived = await qcInspectionItemsRepository.sumReceivedQtyForPoWoItem(item.id);
		const previouslyRejected = await qcInspectionItemsRepository.sumRejectedQtyForPoWoItem(item.id);
		lines.push({
			po_wo_item_id: item.id,
			product_id: item.product_id,
			productSnapshot: item.productSnapshot ?? null,
			batch_id: item.batch_id,
			batchSnapshot: item.batchSnapshot ?? null,
			stock_type: item.stock_type,
			ordered_qty: orderedQty,
			previously_received_qty: previouslyReceived,
			previously_accepted_qty: previouslyAccepted,
			previously_rejected_qty: previouslyRejected,
			current_received_qty: 0,
			total_received_qty: previouslyReceived,
			pending_qty: orderedQty - previouslyReceived,
		});
	}
	return lines;
}

exports.createInspection = async (req, payload) => {
	const { org_id } = req.user;
	const { document_type, document_id, acknowledgement_id, template_id } = payload;

	const config = resolveDocConfig(document_type);
	const doc = await config.model.findOne({
		where: { id: document_id, org_id },
		include: [{ model: config.itemModel, as: 'items' }],
	});
	if (!doc) throw new AppError(`${config.label} not found`, StatusCodes.NOT_FOUND);
	if (!doc[config.qcCheckField]) {
		throw new AppError(`This ${config.label} was not marked as requiring QC`, StatusCodes.BAD_REQUEST);
	}
	if (['rejected', 'cancelled'].includes(doc.status)) {
		throw new AppError(`Cannot create a QC inspection for a ${doc.status} ${config.label}`, StatusCodes.CONFLICT);
	}

	// acknowledgement_id is optional traceability only now (which vendor confirmation this
	// delivery falls under) — it no longer drives line-item derivation or inspection uniqueness.
	// A PO/WO is typically acknowledged once but delivered (and inspected) in several batches, so
	// several QC inspections legitimately share the same acknowledgement_id.
	if (acknowledgement_id) {
		const ack = await OrderAcknowledgement.findOne({
			where: { id: acknowledgement_id, document_type, document_id, org_id },
		});
		if (!ack) throw new AppError('Acknowledgement not found for this order', StatusCodes.NOT_FOUND);
	}

	// At most one open inspection per PO/WO document at a time — prevents two inspectors racing
	// on the same order — while still allowing sequential QC1 -> QC2 -> QC3 as deliveries arrive.
	const openInspection = await QcInspection.findOne({
		where: {
			document_type,
			document_id,
			status: { [Op.in]: OPEN_INSPECTION_STATUSES },
		},
	});
	if (openInspection) {
		throw new AppError(
			`An open QC inspection (${openInspection.qc_no}) already exists for this ${config.label}`,
			StatusCodes.CONFLICT,
		);
	}

	if (template_id) {
		const template = await QcTemplate.findOne({ where: { id: template_id, is_active: true } });
		if (!template) throw new AppError('QC template not found or inactive', StatusCodes.BAD_REQUEST);
	}

	const lineItems = await deriveInspectionItems({ doc });
	if (lineItems.length === 0) {
		throw new AppError(
			`All line items on this ${config.label} have already been fully accepted — no further QC inspection is needed`,
			StatusCodes.CONFLICT,
		);
	}

	const qcNo = await exports.generateQcNumber(req);

	const transaction = await sequelize.transaction();
	try {
		const inspection = await qcInspectionRepository.create(
			{
				org_id,
				document_type,
				document_id,
				acknowledgement_id: acknowledgement_id || null,
				template_id: template_id || null,
				qc_no: qcNo,
				status: 'pending',
			},
			{ transaction },
		);

		await qcInspectionItemsRepository.bulkCreate(
			lineItems.map((item) => ({ ...item, qc_inspection_id: inspection.id })),
			{ transaction },
		);

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: inspection.id,
			action: 'created',
			newState: { document_type, document_id, acknowledgement_id: acknowledgement_id || null },
			transaction,
		});

		await transaction.commit();
		return fetchInspectionOrThrow(req, inspection.id);
	} catch (error) {
		await transaction.rollback();
		throw error;
	}
};

/**
 * QcInspection.document_id is a polymorphic pointer (document_type tells you which table), so
 * there's no Sequelize association to eager-load the PO/WO's own number through — batch-fetch
 * both tables by id instead of hitting each one individually per row.
 */
async function attachDocumentNumbers(inspections) {
	const poIds = [...new Set(inspections.filter((i) => i.document_type === 'purchase_order').map((i) => i.document_id))];
	const woIds = [...new Set(inspections.filter((i) => i.document_type === 'work_order').map((i) => i.document_id))];

	const [pos, wos] = await Promise.all([
		poIds.length
			? PurchaseOrder.findAll({ where: { id: poIds }, attributes: ['id', 'doc_number', 'poPrefix', 'poNo', 'poPostfix'] })
			: [],
		woIds.length
			? WorkOrder.findAll({ where: { id: woIds }, attributes: ['id', 'doc_number', 'woPrefix', 'woNo', 'woPostfix'] })
			: [],
	]);

	const poNoById = new Map(pos.map((p) => [p.id, p.doc_number || `${p.poPrefix || ''}${p.poNo || ''}${p.poPostfix || ''}`]));
	const woNoById = new Map(wos.map((w) => [w.id, w.doc_number || `${w.woPrefix || ''}${w.woNo || ''}${w.woPostfix || ''}`]));

	return inspections.map((inspection) => {
		const plain = inspection.toJSON();
		plain.document_no = (inspection.document_type === 'purchase_order' ? poNoById : woNoById).get(inspection.document_id) || null;
		return plain;
	});
}

exports.getAllInspections = async (req) => {
	const { org_id } = req.user;
	const { status, overall_result, document_type, document_id, inspector_id, from_date, to_date, limit, offset } = req.query;

	const where = { org_id };
	if (status) where.status = status;
	if (overall_result) where.overall_result = overall_result;
	if (document_type) where.document_type = document_type;
	if (document_id) where.document_id = document_id;
	if (inspector_id) where.inspector_id = inspector_id;
	if (from_date || to_date) {
		where.createdAt = {};
		if (from_date) where.createdAt[Op.gte] = from_date;
		if (to_date) where.createdAt[Op.lte] = to_date;
	}

	const { count, rows } = await QcInspection.findAndCountAll({
		where,
		include: [
			{ model: QcInspectionItem, as: 'items' },
			{ model: User, as: 'inspector', attributes: ['id', 'name', 'email'] },
		],
		order: [['createdAt', 'DESC']],
		limit: limit ? parseInt(limit, 10) : 20,
		offset: offset ? parseInt(offset, 10) : 0,
		distinct: true,
	});

	return { count, rows: await attachDocumentNumbers(rows) };
};

exports.getInspectionById = async (req, id) => {
	const inspection = await fetchInspectionOrThrow(req, id);
	const [withDocumentNo] = await attachDocumentNumbers([inspection]);
	return withDocumentNo;
};

/**
 * Per-line rollup driving both the QC screen's read-only header fields and the "Create QC
 * Inspection" gate on the PO/WO detail page. `remaining_qty` (ordered − Σaccepted −
 * Σapproved-short-close) is the completion metric — it can stay above zero even once
 * everything has physically arrived, if some of it was rejected and hasn't been
 * resupplied/accepted yet, and it drops once a Short Close Request is approved even though
 * nothing physically arrived for that qty. This is the single formula shared by the QC-creation
 * gate here and the Short-Close-creation gate in short-close.service.js — both must agree on
 * what's left open for a line, so fix it in exactly one place.
 */
exports.getRemainingForDocument = async (req, { document_type, document_id }) => {
	const { org_id } = req.user;
	const config = resolveDocConfig(document_type);
	const doc = await config.model.findOne({
		where: { id: document_id, org_id },
		include: [{ model: config.itemModel, as: 'items' }],
	});
	if (!doc) throw new AppError(`${config.label} not found`, StatusCodes.NOT_FOUND);

	const items = await Promise.all(
		doc.items.map(async (item) => {
			const orderedQty = parseFloat(item.qty);
			const [acceptedQty, receivedQty, shortClosedQty] = await Promise.all([
				qcInspectionItemsRepository.sumAcceptedQtyForPoWoItem(item.id),
				qcInspectionItemsRepository.sumReceivedQtyForPoWoItem(item.id),
				shortCloseRequestItemsRepository.sumApprovedQtyForPoWoItem(item.id),
			]);
			const remainingQty = Math.max(orderedQty - acceptedQty - shortClosedQty, 0);
			let lineStatus = 'OPEN';
			if (acceptedQty + shortClosedQty >= orderedQty - 0.001) {
				lineStatus = shortClosedQty > 0 ? 'SHORT_CLOSED' : 'FULFILLED';
			} else if (acceptedQty > 0 || shortClosedQty > 0) {
				lineStatus = 'PARTIALLY_FULFILLED';
			}
			return {
				po_wo_item_id: item.id,
				product_id: item.product_id,
				productSnapshot: item.productSnapshot ?? null,
				ordered_qty: orderedQty,
				previously_received_qty: receivedQty,
				accepted_qty: acceptedQty,
				short_closed_qty: shortClosedQty,
				remaining_qty: remainingQty,
				line_status: lineStatus,
			};
		}),
	);

	const openInspection = await QcInspection.findOne({
		where: { document_type, document_id, status: { [Op.in]: OPEN_INSPECTION_STATUSES } },
	});

	return {
		document_type,
		document_id,
		qc_required: Boolean(doc[config.qcCheckField]),
		has_open_inspection: Boolean(openInspection),
		open_inspection_id: openInspection?.id ?? null,
		can_create_inspection:
			Boolean(doc[config.qcCheckField]) && !openInspection && items.some((i) => i.remaining_qty > 0),
		items,
	};
};

exports.assignInspector = async (req, id, { inspector_id }) => {
	const inspection = await fetchInspectionOrThrow(req, id);
	if (!['pending', 'assigned'].includes(inspection.status)) {
		throw new AppError(`Cannot assign an inspector to an inspection with status "${inspection.status}"`, StatusCodes.CONFLICT);
	}

	const previousState = { status: inspection.status, inspector_id: inspection.inspector_id };
	await inspection.update({
		status: 'assigned',
		inspector_id,
		assigned_by: actorSnapshot(req.user),
		assigned_at: new Date(),
	});

	await auditLogService.record({
		req,
		entityType: DOCUMENT_TYPE,
		entityId: id,
		action: 'assigned',
		previousState,
		newState: { status: 'assigned', inspector_id },
	});

	return fetchInspectionOrThrow(req, id);
};

exports.startInspection = async (req, id) => {
	const inspection = await fetchInspectionOrThrow(req, id);
	if (!['pending', 'assigned'].includes(inspection.status)) {
		throw new AppError(`Cannot start an inspection with status "${inspection.status}"`, StatusCodes.CONFLICT);
	}

	const isAssignedInspector = inspection.inspector_id && inspection.inspector_id === req.user.id;
	const isSuperAdmin = (req.user.roles || []).includes('super_admin');
	if (inspection.inspector_id && !isAssignedInspector && !isSuperAdmin) {
		throw new AppError('Only the assigned inspector can start this inspection', StatusCodes.FORBIDDEN);
	}

	const previousState = { status: inspection.status };
	await inspection.update({
		status: 'in_progress',
		inspector_id: inspection.inspector_id || req.user.id,
		started_at: new Date(),
	});

	await auditLogService.record({
		req,
		entityType: DOCUMENT_TYPE,
		entityId: id,
		action: 'started',
		previousState,
		newState: { status: 'in_progress' },
	});

	return fetchInspectionOrThrow(req, id);
};

/**
 * accepted + rejected + rework must equal inspected, and inspected may not exceed this delivery's
 * current_received_qty — checked here (service layer) in addition to the validator, since the
 * validator only checks shape, not cross-field arithmetic against each line's own DB state.
 *
 * Over-delivery is hard-blocked on ACCEPTANCE, not on physical receipt: `current_received_qty`
 * itself is never capped (goods that show up are a physical fact, and a replacement shipment for
 * previously rejected units can legitimately push cumulative receipts past the ordered qty), but
 * `previouslyAcceptedQty + accepted` may never exceed `ordered_qty` for the line.
 */
function validateItemQuantities(item, input, previouslyAcceptedQty) {
	const inspected = parseFloat(input.inspected_qty ?? 0);
	const accepted = parseFloat(input.accepted_qty ?? 0);
	const rejected = parseFloat(input.rejected_qty ?? 0);
	const rework = parseFloat(input.rework_qty ?? 0);
	const currentReceived = parseFloat(input.current_received_qty ?? 0);
	const orderedQty = parseFloat(item.ordered_qty);

	if (currentReceived < 0) {
		throw new AppError(`current_received_qty cannot be negative for item ${item.id}`, StatusCodes.UNPROCESSABLE_ENTITY);
	}
	if (inspected > currentReceived) {
		throw new AppError(
			`Inspected qty (${inspected}) cannot exceed current received qty (${currentReceived}) for item ${item.id}`,
			StatusCodes.UNPROCESSABLE_ENTITY,
		);
	}
	if (Math.abs(accepted + rejected + rework - inspected) > 0.001) {
		throw new AppError(
			`Accepted + rejected + rework (${accepted + rejected + rework}) must equal inspected qty (${inspected}) for item ${item.id}`,
			StatusCodes.UNPROCESSABLE_ENTITY,
		);
	}
	if (rejected > 0 && !input.rejection_reason_id) {
		throw new AppError(`A rejection reason is required when rejected qty > 0 for item ${item.id}`, StatusCodes.UNPROCESSABLE_ENTITY);
	}
	if (previouslyAcceptedQty + accepted > orderedQty + 0.001) {
		throw new AppError(
			`Accepted qty would bring the total accepted (${previouslyAcceptedQty + accepted}) above the ordered qty (${orderedQty}) for item ${item.id} — over-delivery is not permitted`,
			StatusCodes.UNPROCESSABLE_ENTITY,
		);
	}

	if (inspected === 0) return 'pending';
	// Some of this round's current_received_qty is still undispositioned — always 'partial'
	// regardless of the accept/reject split so far, since submitInspection blocks on this exact
	// condition and the badge shouldn't claim "Passed"/"Failed" before that's actually true.
	if (currentReceived - inspected > 0.001) return 'partial';
	if (rejected === 0 && rework === 0) return 'passed';
	if (accepted === 0) return 'failed';
	return 'partial';
}

exports.saveItems = async (req, id, { items = [], results = [] }) => {
	const inspection = await fetchInspectionOrThrow(req, id);
	if (inspection.status !== 'in_progress') {
		throw new AppError(`Cannot edit items on an inspection with status "${inspection.status}"`, StatusCodes.CONFLICT);
	}

	const itemsById = new Map(inspection.items.map((i) => [i.id, i]));
	const transaction = await sequelize.transaction();
	try {
		for (const input of items) {
			const item = itemsById.get(input.id);
			if (!item) {
				throw new AppError(`QC inspection item ${input.id} does not belong to this inspection`, StatusCodes.BAD_REQUEST);
			}
			const previouslyAcceptedQty = await qcInspectionItemsRepository.sumAcceptedQtyForPoWoItem(item.po_wo_item_id, { transaction });
			const result = validateItemQuantities(item, input, previouslyAcceptedQty);

			const currentReceivedQty = parseFloat(input.current_received_qty ?? item.current_received_qty ?? 0);
			const totalReceivedQty = parseFloat(item.previously_received_qty) + currentReceivedQty;

			await item.update(
				{
					current_received_qty: currentReceivedQty,
					total_received_qty: totalReceivedQty,
					pending_qty: parseFloat(item.ordered_qty) - totalReceivedQty,
					inspected_qty: input.inspected_qty ?? 0,
					accepted_qty: input.accepted_qty ?? 0,
					rejected_qty: input.rejected_qty ?? 0,
					rework_qty: input.rework_qty ?? 0,
					result,
					rejection_reason_id: input.rejection_reason_id || null,
					remarks: input.remarks || null,
					serial_nos: input.serial_nos || null,
					rejected_serial_nos: input.rejected_serial_nos || null,
				},
				{ transaction },
			);
		}

		for (const resultInput of results) {
			await QcResult.upsert(
				{
					id: resultInput.id || undefined,
					qc_inspection_item_id: resultInput.qc_inspection_item_id,
					qc_template_item_id: resultInput.qc_template_item_id || null,
					observed_value: resultInput.observed_value || null,
					result: resultInput.result || 'na',
					remarks: resultInput.remarks || null,
				},
				{ transaction },
			);
		}

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchInspectionOrThrow(req, id);
};

exports.submitInspection = async (req, id) => {
	const inspection = await fetchInspectionOrThrow(req, id);
	if (inspection.status !== 'in_progress') {
		throw new AppError(`Cannot submit an inspection with status "${inspection.status}"`, StatusCodes.CONFLICT);
	}

	// An inspection is seeded (deriveInspectionItems) with one line per still-open PO/WO item,
	// not just the ones in this particular delivery — a single batch routinely contains only
	// some of a multi-line PO/WO. Lines nobody received this round correctly stay at their
	// default current_received_qty: 0 / result: 'pending' and must NOT block submission; only a
	// line that received something but was never dispositioned should. A line with 0 received
	// simply carries forward to whichever future QC inspection actually covers its delivery.
	const nothingReceivedAtAll = inspection.items.every((i) => parseFloat(i.current_received_qty ?? 0) === 0);
	if (nothingReceivedAtAll) {
		throw new AppError('Nothing has been received yet for this inspection', StatusCodes.UNPROCESSABLE_ENTITY);
	}

	const unresolved = inspection.items.filter(
		(i) => parseFloat(i.current_received_qty ?? 0) > 0 && i.result === 'pending',
	);
	if (unresolved.length > 0) {
		throw new AppError(`${unresolved.length} item(s) still have no recorded result`, StatusCodes.UNPROCESSABLE_ENTITY);
	}

	// Every unit physically received this round must be dispositioned (accepted or rejected —
	// rework included) before the inspection can go to the approver. saveItems intentionally
	// allows inspected < current_received_qty (so an inspector can save partial progress
	// mid-review), but leaving that gap open through submission meant leftover undispositioned
	// qty silently vanished into a "Passed" result — never counted as accepted or rejected —
	// while a later QC round could still receive further qty against the same line, which is
	// how a PO/WO can end up "over-received" beyond its ordered qty for no legitimate reason.
	const undispositioned = inspection.items.filter((i) => {
		const currentReceived = parseFloat(i.current_received_qty ?? 0);
		const inspected = parseFloat(i.inspected_qty ?? 0);
		return currentReceived - inspected > 0.001;
	});
	if (undispositioned.length > 0) {
		throw new AppError(
			`${undispositioned.length} item(s) have received qty that hasn't been fully accepted or rejected yet — resolve the remaining qty before submitting`,
			StatusCodes.UNPROCESSABLE_ENTITY,
		);
	}

	if (inspection.template?.items?.length) {
		const requiredKeys = new Set(inspection.template.items.filter((t) => t.is_required).map((t) => t.id));
		const answeredKeys = new Set(
			inspection.items.flatMap((item) => item.results.filter((r) => r.result !== 'na').map((r) => r.qc_template_item_id)),
		);
		const missing = [...requiredKeys].filter((k) => !answeredKeys.has(k));
		if (missing.length > 0) {
			throw new AppError('Required checklist items are not yet answered', StatusCodes.UNPROCESSABLE_ENTITY);
		}
	}

	const transaction = await sequelize.transaction();
	try {
		await workflowEngine.startInstance({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: inspection.id,
			orgId: inspection.org_id,
			transaction,
		});

		await inspection.update({ status: 'completed', completed_at: new Date() }, { transaction });

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

	return fetchInspectionOrThrow(req, id);
};

function computeOverallResult(items) {
	const results = items.map((i) => i.result);
	if (results.every((r) => r === 'passed')) return 'passed';
	if (results.every((r) => r === 'failed')) return 'failed';
	return 'partial';
}

exports.approveInspection = async (req, id) => {
	const inspection = await fetchInspectionOrThrow(req, id);
	if (inspection.status !== 'completed') {
		throw new AppError(`Cannot approve an inspection with status "${inspection.status}"`, StatusCodes.CONFLICT);
	}

	await qcWorkflow.assertCanAct(req, inspection);

	const stageNameBeforeAction = (
		await workflowEngine.getInstanceWithStages({ documentType: DOCUMENT_TYPE, documentId: id })
	).instance.currentStage?.stage_name ?? null;

	const overallResult = computeOverallResult(inspection.items);

	const transaction = await sequelize.transaction();
	try {
		const instance = await workflowEngine.advanceStage({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: id,
			action: 'approved',
			transaction,
		});

		await inspection.update(
			{
				status: instance.status,
				overall_result: overallResult,
				approved_by: actorSnapshot(req.user),
				approved_at: new Date(),
			},
			{ transaction },
		);

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: id,
			action: 'approved',
			newState: { status: instance.status, overall_result: overallResult },
			workflowStageName: stageNameBeforeAction,
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchInspectionOrThrow(req, id);
};

exports.rejectInspection = async (req, id, remarks) => {
	const inspection = await fetchInspectionOrThrow(req, id);
	if (inspection.status !== 'completed') {
		throw new AppError(`Cannot reject an inspection with status "${inspection.status}"`, StatusCodes.CONFLICT);
	}
	return qcWorkflow.reject(req, id, remarks);
};

exports.cancelInspection = async (req, id, remarks) => {
	const inspection = await fetchInspectionOrThrow(req, id);
	if (inspection.status === 'approved') {
		throw new AppError('An approved QC inspection cannot be cancelled', StatusCodes.CONFLICT);
	}
	if (inspection.status === 'cancelled') {
		throw new AppError('This QC inspection is already cancelled', StatusCodes.CONFLICT);
	}

	// Draft-equivalent (pending/assigned/in_progress) inspections have no workflow instance yet
	// (startInstance only runs on submit) — cancel them directly, same shape as
	// cancelPurchaseOrder's draft branch.
	if (['pending', 'assigned', 'in_progress'].includes(inspection.status)) {
		await inspection.update({ status: 'cancelled' });
		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: id,
			action: 'cancelled',
			remarks,
		});
		return fetchInspectionOrThrow(req, id);
	}

	return qcWorkflow.cancel(req, id, remarks);
};

exports.reinspect = async (req, id) => {
	const original = await fetchInspectionOrThrow(req, id);
	if (original.status !== 'rejected') {
		throw new AppError('Only a rejected QC inspection can be re-inspected', StatusCodes.CONFLICT);
	}

	const qcNo = await exports.generateQcNumber(req);

	const transaction = await sequelize.transaction();
	try {
		const reinspection = await qcInspectionRepository.create(
			{
				org_id: original.org_id,
				document_type: original.document_type,
				document_id: original.document_id,
				acknowledgement_id: original.acknowledgement_id,
				template_id: original.template_id,
				qc_no: qcNo,
				status: 'pending',
				reinspection_of_id: original.id,
			},
			{ transaction },
		);

		// original's items never counted toward finalized sums (its inspection was rejected), so
		// previously_received_qty/previously_accepted_qty/previously_rejected_qty are all
		// recomputed fresh here rather than copied from the stale original snapshot — they should
		// land on the same values in practice, but this stays correct if anything else finalized
		// against this line in between.
		await qcInspectionItemsRepository.bulkCreate(
			await Promise.all(
				original.items.map(async (item) => {
					const [previouslyReceived, previouslyAccepted, previouslyRejected] = await Promise.all([
						qcInspectionItemsRepository.sumReceivedQtyForPoWoItem(item.po_wo_item_id, { transaction }),
						qcInspectionItemsRepository.sumAcceptedQtyForPoWoItem(item.po_wo_item_id, { transaction }),
						qcInspectionItemsRepository.sumRejectedQtyForPoWoItem(item.po_wo_item_id, { transaction }),
					]);
					const currentReceivedQty = parseFloat(item.current_received_qty);
					return {
						qc_inspection_id: reinspection.id,
						po_wo_item_id: item.po_wo_item_id,
						product_id: item.product_id,
						productSnapshot: item.productSnapshot,
						batch_id: item.batch_id,
						batchSnapshot: item.batchSnapshot,
						stock_type: item.stock_type,
						ordered_qty: item.ordered_qty,
						previously_received_qty: previouslyReceived,
						previously_accepted_qty: previouslyAccepted,
						previously_rejected_qty: previouslyRejected,
						current_received_qty: currentReceivedQty,
						total_received_qty: previouslyReceived + currentReceivedQty,
						pending_qty: parseFloat(item.ordered_qty) - (previouslyReceived + currentReceivedQty),
					};
				}),
			),
			{ transaction },
		);

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: reinspection.id,
			action: 'reinspected',
			newState: { reinspection_of_id: original.id },
			transaction,
		});

		await transaction.commit();
		return fetchInspectionOrThrow(req, reinspection.id);
	} catch (error) {
		await transaction.rollback();
		throw error;
	}
};

exports.getInspectionWorkflow = async (req, id) => {
	await fetchInspectionOrThrow(req, id);
	return qcWorkflow.getWorkflow(req, id);
};

exports.listAttachments = async (req, id) => {
	await fetchInspectionOrThrow(req, id);
	const docs = await orderDocumentRepository.findAllForContext('qc', id);
	return Promise.all(
		docs.map(async (doc) => {
			const plain = doc.get({ plain: true });
			plain.signed_url = await generateSignedUrl(doc.file_key);
			return plain;
		}),
	);
};

exports.uploadAttachment = async (req, id, file) => {
	const inspection = await fetchInspectionOrThrow(req, id);
	if (!file) throw new AppError('No file uploaded', StatusCodes.BAD_REQUEST);

	const ext = path.extname(file.originalname);
	const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
	const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
	const key = `orders/${inspection.document_type}/${inspection.document_id}/qc/${unique}-${base}${ext}`;

	await s3.send(
		new PutObjectCommand({
			Bucket: process.env.AWS_BUCKET_NAME,
			Key: key,
			Body: file.buffer,
			ContentType: file.mimetype,
		}),
	);

	return orderDocumentRepository.create({
		document_type: inspection.document_type,
		document_id: inspection.document_id,
		context: 'qc',
		context_id: inspection.id,
		file_name: file.originalname,
		file_key: key,
		file_type: file.mimetype,
		file_size: file.size,
		storage_type: 's3',
		uploaded_by: actorSnapshot(req.user),
	});
};

/**
 * Print-preview HTML for a QC Inspection, mirroring indent.service.js's generateInvoiceHtml.
 * A QcInspection has no vendor/unit of its own (it's polymorphic over PO/WO) so the underlying
 * PO/WO — including its indent's unit/department — is fetched here purely for header display.
 */
exports.generateInvoiceHtml = async (req) => {
	const { id } = req.params;
	const inspection = await fetchInspectionOrThrow(req, id);
	const [withDocumentNo] = await attachDocumentNumbers([inspection]);

	const response = await calculateQcInvoice(inspection, withDocumentNo);

	const html = await generateInvoiceHTML({ ...response, copyTitle: 'QC INSPECTION COPY' }, 'qcTemplate');
	return `<div class="preview-page">\n${html}\n</div>`;
};

exports.downloadInvoicePdf = async (req) => {
	const { html = '' } = req.body;
	const pdfPath = await generateInvoiceHTMLPDF(html, 'qcTemplate', { multi: true });
	return pdfPath;
};

async function calculateQcInvoice(inspection, withDocumentNo) {
	const invoiceData = inspection.get({ plain: true });

	// Logo lives on the org-admin user, not on MasterUnit — same lookup indent.service.js uses.
	let businessLogo = null;
	let business = null;

	const config = resolveDocConfig(invoiceData.document_type);
	const doc = await config.model.findOne({
		where: { id: invoiceData.document_id },
		include: [
			{
				model: Indent,
				as: 'indent',
				attributes: ['id', 'unit_id', 'department_id'],
				include: [
					{ model: MasterUnit, as: 'unit' },
					{ model: Department, as: 'department' },
				],
			},
		],
	});
	const unit = doc?.indent?.unit ?? null;
	const department = doc?.indent?.department ?? null;

	const orgRole = await Role.findOne({ where: { code: 'org_admin' }, attributes: ['id'] });
	const userData = await User.findOne({
		where: { org_id: invoiceData.org_id },
		include: [
			{ model: organization, as: 'organization' },
			{
				model: Role,
				as: 'userRoles',
				through: { attributes: [] },
				attributes: ['id', 'name', 'code'],
				where: orgRole?.id,
			},
		],
	});
	if (userData?.logo) {
		businessLogo = await getImageAsBase64DataUrl(userData.logo);
	}

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
			${business.city || ''} - ${business.pincode || ''}, ${business?._state?.state_name || ''}<br>`;
	}

	const vendorInfo = doc?.vendorInfo || null;
	const documentLabel = config.label;
	const documentNo = withDocumentNo?.document_no || `${documentLabel} #${invoiceData.document_id}`;

	const productItems = (invoiceData.items || []).map((item) => {
		const orderedQty = parseFloat(item.ordered_qty || 0);
		// total_received_qty is cumulative across every QC round for this po_wo_item (it can
		// legitimately exceed orderedQty — a replacement shipment for previously rejected units
		// still counts as received). Breaking Received/Accepted/Rejected into Previous/This
		// Round/Total columns (rather than only showing the cumulative figure) keeps that
		// reconciled and legible instead of looking like an error against Ordered Qty.
		const previouslyReceivedQty = parseFloat(item.previously_received_qty || 0);
		const currentReceivedQty = parseFloat(item.current_received_qty || 0);
		const totalReceivedQty = parseFloat(item.total_received_qty || 0);
		const previouslyAcceptedQty = parseFloat(item.previously_accepted_qty || 0);
		const currentAcceptedQty = parseFloat(item.accepted_qty || 0);
		const totalAcceptedQty = previouslyAcceptedQty + currentAcceptedQty;
		const previouslyRejectedQty = parseFloat(item.previously_rejected_qty || 0);
		const currentRejectedQty = parseFloat(item.rejected_qty || 0);
		const totalRejectedQty = previouslyRejectedQty + currentRejectedQty;
		const reworkQty = parseFloat(item.rework_qty || 0);

		return {
			...item,
			item_name: item.productSnapshot?.name || 'N/A',
			item_code: item.productSnapshot?.code || item.productSnapshot?.item_code || '',
			orderedQty,
			previouslyReceivedQty,
			currentReceivedQty,
			totalReceivedQty,
			previouslyAcceptedQty,
			currentAcceptedQty,
			totalAcceptedQty,
			previouslyRejectedQty,
			currentRejectedQty,
			totalRejectedQty,
			reworkQty,
			rejectionReasonName: item.rejectionReason?.name || '',
			checklistResults: (item.results || [])
				.filter((r) => r.result !== 'na')
				.map((r) => ({
					parameter_name: r.templateItem?.parameter_name || '',
					observed_value: r.observed_value || '',
					result: r.result,
					remarks: r.remarks || '',
				})),
		};
	});

	const totals = productItems.reduce(
		(acc, item) => {
			acc.orderedQty += item.orderedQty;
			acc.previouslyReceivedQty += item.previouslyReceivedQty;
			acc.currentReceivedQty += item.currentReceivedQty;
			acc.totalReceivedQty += item.totalReceivedQty;
			acc.previouslyAcceptedQty += item.previouslyAcceptedQty;
			acc.currentAcceptedQty += item.currentAcceptedQty;
			acc.totalAcceptedQty += item.totalAcceptedQty;
			acc.previouslyRejectedQty += item.previouslyRejectedQty;
			acc.currentRejectedQty += item.currentRejectedQty;
			acc.totalRejectedQty += item.totalRejectedQty;
			acc.reworkQty += item.reworkQty;
			return acc;
		},
		{
			orderedQty: 0,
			previouslyReceivedQty: 0,
			currentReceivedQty: 0,
			totalReceivedQty: 0,
			previouslyAcceptedQty: 0,
			currentAcceptedQty: 0,
			totalAcceptedQty: 0,
			previouslyRejectedQty: 0,
			currentRejectedQty: 0,
			totalRejectedQty: 0,
			reworkQty: 0,
		},
	);

	return {
		...invoiceData,
		businessLogo,
		business,
		vendorInfo,
		unit,
		department,
		documentLabel,
		documentNo,
		productItems,
		totals,
	};
}
