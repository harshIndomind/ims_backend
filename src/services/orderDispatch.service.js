/**
 * Dispatch and Acknowledge are generic, document-type-agnostic events (identical shape for
 * Purchase Orders and Work Orders), so — unlike submit/approve/reject which each module owns —
 * they live in one shared service keyed by (documentType, documentId), the same polymorphic
 * convention already used by audit_logs and the workflow engine. Callers (purchase-order.service.js,
 * work-order.service.js) own the domain-specific precondition (only an 'approved' document may be
 * dispatched) and pass in the already-fetched, already-checked document instance.
 */
const path = require('path');
const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { sequelize } = require('../models/index');
const { MasterDispatchMethod, MasterAcknowledgementMode } = require('../models/index');
const {
	orderDispatchRepository,
	orderAcknowledgementRepository,
	orderDocumentRepository,
	masterDispatchMethodRepository,
	masterAcknowledgementModeRepository,
} = require('../repository/index');
const auditLogService = require('./auditLog.service');
const logger = require('../utils/logger');
const { s3, PutObjectCommand, generateSignedUrl } = require('../utils/s3Bucket');
const { sendDispatchMail } = require('../utils/mailer');

// When enabled, a document may only be dispatched once and acknowledged once — re-dispatch
// and multiple acknowledgements are rejected here regardless of what the frontend allows,
// since this is the actual enforcement point (the frontend flag only hides the buttons).
function isSingleDispatchAckModeEnabled() {
	return process.env.ENABLE_SINGLE_DISPATCH_ACK_MODE === 'true';
}

function actorSnapshot(user) {
	return user ? { id: user.id, name: user.name, email: user.email } : null;
}

function buildAttachmentKey(documentType, documentId, context, filename) {
	const ext = path.extname(filename);
	const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
	const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
	return `orders/${documentType}/${documentId}/${context}/${unique}-${base}${ext}`;
}

exports.listDispatchMethods = () => masterDispatchMethodRepository.findAllActive();
exports.listAcknowledgementModes = () => masterAcknowledgementModeRepository.findAllActive();

exports.listDispatches = (documentType, documentId) =>
	orderDispatchRepository.findAllForDocument(documentType, documentId, {
		include: [{ model: MasterDispatchMethod, as: 'dispatchMethod' }],
	});

exports.listAcknowledgements = async (documentType, documentId) => {
	const acknowledgements = await orderAcknowledgementRepository.findAllForDocument(documentType, documentId, {
		include: [{ model: MasterAcknowledgementMode, as: 'mode' }],
	});

	return Promise.all(
		acknowledgements.map(async (ack) => {
			const plain = ack.get({ plain: true });
			const docs = await orderDocumentRepository.findAllForContext('acknowledgement', ack.id);
			plain.attachments = await Promise.all(
				docs.map(async (doc) => {
					const docPlain = doc.get({ plain: true });
					docPlain.signed_url = await generateSignedUrl(doc.file_key);
					return docPlain;
				}),
			);
			return plain;
		}),
	);
};

/**
 * Fire-and-forget email send, run after the dispatch record is already committed — an email
 * delivery failure must never undo the fact that dispatch happened, so the outcome is only
 * ever reflected in `email_status`, never in a rollback.
 */
async function sendDispatchEmailAsync({ dispatch, documentLabel, generatePdfBuffer }) {
	try {
		const attachments = [];
		if (generatePdfBuffer) {
			const buffer = await generatePdfBuffer();
			if (buffer) attachments.push({ filename: `${documentLabel}.pdf`, content: buffer });
		}

		await sendDispatchMail(dispatch.recipient_email, {
			subject: `${documentLabel} has been dispatched`,
			body: {
				documentLabel,
				recipientName: dispatch.recipient_name,
				dispatchDate: dispatch.dispatch_date,
				referenceNo: dispatch.reference_no,
				remarks: dispatch.remarks,
			},
			attachments,
		});

		await dispatch.update({ email_status: 'sent' });
	} catch (err) {
		logger.error('Dispatch email failed', { dispatchId: dispatch.id, err: err?.message });
		await dispatch.update({ email_status: 'failed' }).catch(() => {});
	}
}

/**
 * @param {object} params
 * @param {object} params.req
 * @param {'purchase_order'|'work_order'} params.documentType
 * @param {number} params.documentId
 * @param {Model} params.doc - the PO/WO instance; caller has already verified it's in a
 *   dispatchable state (status === 'approved')
 * @param {object} params.payload - { dispatchMethodId, dispatchDate, recipientName,
 *   recipientEmail, referenceNo, remarks }
 * @param {string} params.documentLabel - human-readable number (e.g. "PO-2026-0042") for the email
 * @param {() => Promise<Buffer>} [params.generatePdfBuffer] - optional PDF attachment source
 */
exports.dispatchDocument = async ({ req, documentType, documentId, doc, payload, documentLabel, generatePdfBuffer }) => {
	const { dispatchMethodId, dispatchDate, recipientName, recipientEmail, referenceNo, remarks } = payload;

	const method = await masterDispatchMethodRepository.findById(dispatchMethodId);
	if (!method || !method.is_active) {
		throw new AppError('Invalid dispatch method', StatusCodes.BAD_REQUEST);
	}
	if (method.requires_recipient_email && !recipientEmail) {
		throw new AppError(`Recipient email is required for dispatch method "${method.name}"`, StatusCodes.BAD_REQUEST);
	}

	const previousDispatchCount = await orderDispatchRepository.countForDocument(documentType, documentId);
	if (isSingleDispatchAckModeEnabled() && previousDispatchCount >= 1) {
		throw new AppError('This order has already been dispatched. Re-dispatch is disabled.', StatusCodes.CONFLICT);
	}

	const dispatchNo = previousDispatchCount + 1;
	const previousDispatchStatus = doc.dispatch_status;
	const emailStatus = method.requires_recipient_email ? 'queued' : 'not_applicable';

	const transaction = await sequelize.transaction();
	let dispatch;
	try {
		dispatch = await orderDispatchRepository.create(
			{
				org_id: req.user.org_id,
				document_type: documentType,
				document_id: documentId,
				dispatch_no: dispatchNo,
				dispatch_method_id: dispatchMethodId,
				dispatch_date: dispatchDate,
				recipient_name: recipientName || null,
				recipient_email: recipientEmail || null,
				reference_no: referenceNo || null,
				remarks: remarks || null,
				email_status: emailStatus,
				dispatched_by: actorSnapshot(req.user),
			},
			{ transaction },
		);

		await doc.update({ dispatch_status: 'dispatched', last_dispatched_at: new Date() }, { transaction });

		await auditLogService.record({
			req,
			entityType: documentType,
			entityId: documentId,
			action: dispatchNo === 1 ? 'dispatched' : 'redispatched',
			previousState: { dispatch_status: previousDispatchStatus },
			newState: { dispatch_status: 'dispatched' },
			remarks,
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	if (method.requires_recipient_email) {
		// sendDispatchEmailAsync({ dispatch, documentLabel, generatePdfBuffer });
	}

	return dispatch;
};

/**
 * @param {object} params
 * @param {object} params.req
 * @param {'purchase_order'|'work_order'} params.documentType
 * @param {number} params.documentId
 * @param {Model} params.doc
 * @param {object} params.payload - { acknowledgementModeId, acknowledgedByName,
 *   acknowledgementDate, vendorReferenceNo, remarks, dispatchId? }
 * @param {Express.Multer.File} [params.file] - optional attachment
 */
exports.acknowledgeDocument = async ({ req, documentType, documentId, doc, payload, file }) => {
	const { acknowledgementModeId, acknowledgedByName, acknowledgementDate, vendorReferenceNo, remarks, dispatchId } = payload;

	const mode = await masterAcknowledgementModeRepository.findById(acknowledgementModeId);
	if (!mode || !mode.is_active) {
		throw new AppError('Invalid acknowledgement mode', StatusCodes.BAD_REQUEST);
	}

	const existingDispatches = await orderDispatchRepository.findAllForDocument(documentType, documentId);
	if (existingDispatches.length === 0) {
		throw new AppError('This order has not been dispatched yet', StatusCodes.CONFLICT);
	}

	if (isSingleDispatchAckModeEnabled()) {
		const existingAcknowledgements = await orderAcknowledgementRepository.findAllForDocument(documentType, documentId);
		if (existingAcknowledgements.length >= 1) {
			throw new AppError(
				'This order has already been acknowledged. Multiple acknowledgements are disabled.',
				StatusCodes.CONFLICT,
			);
		}
	}

	let resolvedDispatchId = dispatchId || null;
	if (!resolvedDispatchId) {
		resolvedDispatchId = existingDispatches[existingDispatches.length - 1].id;
	}

	// Uploaded outside the DB transaction (matches indentDocument.service.js's existing
	// pattern) — S3 has no transactional rollback, so this is the same tradeoff already
	// accepted elsewhere in the codebase, not a new risk introduced here.
	let uploadedKey = null;
	if (file) {
		uploadedKey = buildAttachmentKey(documentType, documentId, 'acknowledgement', file.originalname);
		await s3.send(
			new PutObjectCommand({
				Bucket: process.env.AWS_BUCKET_NAME,
				Key: uploadedKey,
				Body: file.buffer,
				ContentType: file.mimetype,
			}),
		);
	}

	const previousDispatchStatus = doc.dispatch_status;

	const transaction = await sequelize.transaction();
	let acknowledgement;
	try {
		acknowledgement = await orderAcknowledgementRepository.create(
			{
				org_id: req.user.org_id,
				document_type: documentType,
				document_id: documentId,
				dispatch_id: resolvedDispatchId,
				acknowledged_by_name: acknowledgedByName,
				acknowledgement_date: acknowledgementDate,
				acknowledgement_mode_id: acknowledgementModeId,
				vendor_reference_no: vendorReferenceNo || null,
				remarks: remarks || null,
				recorded_by: actorSnapshot(req.user),
			},
			{ transaction },
		);

		await doc.update({ dispatch_status: 'acknowledged', last_acknowledged_at: new Date() }, { transaction });

		if (file) {
			await orderDocumentRepository.create(
				{
					document_type: documentType,
					document_id: documentId,
					context: 'acknowledgement',
					context_id: acknowledgement.id,
					file_name: file.originalname,
					file_key: uploadedKey,
					file_type: file.mimetype,
					file_size: file.size,
					storage_type: 's3',
					uploaded_by: actorSnapshot(req.user),
				},
				{ transaction },
			);
		}

		await auditLogService.record({
			req,
			entityType: documentType,
			entityId: documentId,
			action: 'acknowledged',
			previousState: { dispatch_status: previousDispatchStatus },
			newState: { dispatch_status: 'acknowledged' },
			remarks,
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return acknowledgement;
};

/**
 * Builds workflow-timeline-shaped rows for dispatch/acknowledge events so they can be merged
 * into the existing `/workflow` endpoint's `history` array — the frontend's generic
 * WorkflowHistoryTab renders them with no new component logic, only new action labels.
 */
exports.getMergedHistoryRows = async (documentType, documentId) => {
	const [dispatches, acknowledgements] = await Promise.all([
		exports.listDispatches(documentType, documentId),
		orderAcknowledgementRepository.findAllForDocument(documentType, documentId, {
			include: [{ model: MasterAcknowledgementMode, as: 'mode' }],
		}),
	]);

	// Synthetic, offset ids so these rows can key alongside real workflow_actions rows in the
	// same table — the frontend's WorkflowActionRow type expects a numeric `id`, but these
	// events live in a different table (order_dispatches/order_acknowledgements), not
	// workflow_actions, so there's no natural shared id space.
	const dispatchRows = dispatches.map((d) => ({
		id: 1_000_000 + d.id,
		workflow_instance_id: null,
		workflow_stage_id: null,
		action: d.dispatch_no === 1 ? 'dispatched' : 'redispatched',
		performed_by: d.dispatched_by,
		performed_by_role: null,
		remarks: d.remarks,
		createdAt: d.createdAt,
		stageName: d.dispatch_no === 1 ? 'Dispatched' : `Re-dispatched (#${d.dispatch_no})`,
		previousStage: null,
		nextStage: null,
		metadata: {
			dispatchMethod: d.dispatchMethod?.name ?? null,
			recipientName: d.recipient_name,
			recipientEmail: d.recipient_email,
			referenceNo: d.reference_no,
			emailStatus: d.email_status,
		},
	}));

	const acknowledgementRows = acknowledgements.map((a) => ({
		id: 2_000_000 + a.id,
		workflow_instance_id: null,
		workflow_stage_id: null,
		action: 'acknowledged',
		performed_by: a.recorded_by,
		performed_by_role: null,
		remarks: a.remarks,
		createdAt: a.createdAt,
		stageName: 'Acknowledged',
		previousStage: null,
		nextStage: null,
		metadata: {
			acknowledgedByName: a.acknowledged_by_name,
			mode: a.mode?.name ?? null,
			vendorReferenceNo: a.vendor_reference_no,
		},
	}));

	return [...dispatchRows, ...acknowledgementRows];
};
