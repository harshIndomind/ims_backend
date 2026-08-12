const crypto = require('crypto');
const { fetch } = require('undici');
const { Op } = require('sequelize');
const { StatusCodes } = require('http-status-codes');
const { sequelize } = require('../models/index');
const {
	GoodsReceiptNote,
	GoodsReceiptNoteItem,
	PurchaseOrder,
	PurchaseOrderItem,
	QcInspection,
	QcInspectionItem,
} = require('../models/index');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const {
	VCP_SERVICE_API_BASE_URL,
	VCP_SERVICE_PRODUCT_ENDPOINT,
	S2S_COMM_KEY,
} = require('../config/serverConfig');

async function callVcpStockEndpoint(req, path, body) {
	const URL = `${VCP_SERVICE_API_BASE_URL}${VCP_SERVICE_PRODUCT_ENDPOINT}${path}`;
	const token = req.cookies.accessToken;

	let response;
	try {
		response = await fetch(URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
				'x-s2s-comm-key': S2S_COMM_KEY,
			},
			body: JSON.stringify(body),
		});
	} catch (err) {
		throw new AppError('Product service is currently unavailable. Please try again later.', 503);
	}

	const data = await response.json();
	if (!response.ok) {
		throw new AppError(data?.message || `${path} failed with HTTP ${response.status}`, response.status);
	}
	return data;
}

exports.generateGrnNumber = async (req) => {
	const { org_id } = req.user;
	const latest = await GoodsReceiptNote.findOne({
		where: { org_id },
		order: [['createdAt', 'DESC']],
	});

	let next = 1;
	if (latest) {
		const latestNumber = parseInt(latest.grnNo, 10);
		if (!isNaN(latestNumber)) next = latestNumber + 1;
	}
	return next.toString().padStart(4, '0');
};

exports.createGRN = async (req) => {
	const { org_id } = req.user;
	const { purchase_order_id, grnDetail = {}, grn_date, remarks, items } = req.body;

	if (!Array.isArray(items) || items.length === 0) {
		throw new AppError('GRN must include at least one item', StatusCodes.BAD_REQUEST);
	}

	const po = await PurchaseOrder.findOne({
		where: { id: purchase_order_id, org_id },
		include: [{ model: PurchaseOrderItem, as: 'items' }],
	});
	if (!po) throw new AppError('Purchase Order not found', StatusCodes.NOT_FOUND);

	const poItemsById = new Map(po.items.map((i) => [i.id, i]));

	// When this PO required QC, GRN creation is gated on an approved inspection — see
	// resolveQcInspectionItem below. Non-QC POs (the vast majority today) take the exact same
	// path as before this gate existed.
	const qcRequired = Boolean(po.po_qc_check);

	/**
	 * Loads and validates the qc_inspection_item a GRN line claims to be drawing from: it must
	 * belong to an inspection that is (a) approved, and (b) for this same PO. Only the
	 * inspection's accepted_qty may ever reach GRN — rejected/rework quantity is never
	 * reachable from this function, by construction (it's simply never read).
	 */
	async function resolveQcInspectionItem(poItem, input) {
		if (!input.qc_inspection_item_id) {
			throw new AppError(
				`This Purchase Order requires QC — item ${input.purchase_order_item_id} must reference an approved qc_inspection_item_id`,
				StatusCodes.BAD_REQUEST,
			);
		}

		const qcItem = await QcInspectionItem.findOne({
			where: { id: input.qc_inspection_item_id, po_wo_item_id: poItem.id },
			include: [{ model: QcInspection, as: 'inspection' }],
		});
		if (!qcItem) {
			throw new AppError(`QC inspection item ${input.qc_inspection_item_id} not found for this PO item`, StatusCodes.BAD_REQUEST);
		}
		if (qcItem.inspection.document_type !== 'purchase_order' || qcItem.inspection.document_id !== purchase_order_id) {
			throw new AppError(`QC inspection item ${input.qc_inspection_item_id} does not belong to this Purchase Order`, StatusCodes.BAD_REQUEST);
		}
		if (qcItem.inspection.status !== 'approved') {
			throw new AppError(
				`Cannot create a GRN from QC inspection ${qcItem.inspection.qc_no} — it is "${qcItem.inspection.status}", not approved`,
				StatusCodes.CONFLICT,
			);
		}

		const alreadyDrawn = parseFloat(
			(await GoodsReceiptNoteItem.sum('received_qty', {
				where: { qc_inspection_item_id: qcItem.id },
				include: [{ model: GoodsReceiptNote, as: 'goodsReceiptNote', attributes: [], where: { status: 'active' } }],
			})) || 0,
		);
		return { qcItem, alreadyDrawn };
	}

	// --- Phase 0: validate every line against the PO's ordered qty (and, for QC orders, the
	// approved QC-accepted qty) before touching anything ---
	const linesToReceive = [];
	for (const input of items) {
		const poItem = poItemsById.get(input.purchase_order_item_id);
		if (!poItem) {
			throw new AppError(`Purchase order item ${input.purchase_order_item_id} does not belong to this PO`, StatusCodes.BAD_REQUEST);
		}

		const receivedQty = parseFloat(input.received_qty || 0);
		if (receivedQty <= 0 && !(input.serial_nos?.length > 0)) {
			throw new AppError(`received_qty must be greater than zero for item ${input.purchase_order_item_id}`, StatusCodes.BAD_REQUEST);
		}

		const alreadyReceived = parseFloat(
			(await GoodsReceiptNoteItem.sum('received_qty', {
				where: { purchase_order_item_id: poItem.id },
				include: [{ model: GoodsReceiptNote, as: 'goodsReceiptNote', attributes: [], where: { status: 'active' } }],
			})) || 0,
		);

		const orderedQty = parseFloat(poItem.qty);
		const effectiveReceivedQty = poItem.stock_type === 'serial' ? (input.serial_nos?.length || 0) : receivedQty;

		if (alreadyReceived + effectiveReceivedQty > orderedQty) {
			throw new AppError(
				`Cannot receive ${effectiveReceivedQty} for "${poItem.productSnapshot?.name || poItem.id}" — only ${Math.max(0, orderedQty - alreadyReceived)} remaining against the ordered qty of ${orderedQty}`,
				StatusCodes.BAD_REQUEST,
			);
		}

		let qcInspectionItemId = null;
		if (qcRequired) {
			const { qcItem, alreadyDrawn } = await resolveQcInspectionItem(poItem, input);
			const acceptedQty = parseFloat(qcItem.accepted_qty);
			if (alreadyDrawn + effectiveReceivedQty > acceptedQty) {
				throw new AppError(
					`Cannot receive ${effectiveReceivedQty} for "${poItem.productSnapshot?.name || poItem.id}" — only ${Math.max(0, acceptedQty - alreadyDrawn)} remaining against QC-accepted qty of ${acceptedQty}`,
					StatusCodes.BAD_REQUEST,
				);
			}
			qcInspectionItemId = qcItem.id;
		}

		linesToReceive.push({ poItem, input, effectiveReceivedQty, qcInspectionItemId });
	}

	// --- Phase 1: record the receipt in VCP's stock ledger (always succeeds — no availability check for a receipt) ---
	const receiptIdempotencyKey = `GRN-PO-${purchase_order_id}-${crypto.randomUUID()}`;
	await callVcpStockEndpoint(req, '/receive-stock', {
		idempotencyKey: receiptIdempotencyKey,
		items: linesToReceive.map(({ poItem, input }) => ({
			product_id: poItem.product_id,
			batch_id: poItem.batch_id || null,
			qty: parseFloat(input.received_qty || 0),
			selected_uom_id: poItem.selected_uom_id || null,
			serial_nos: input.serial_nos || undefined,
			rate: parseFloat(poItem.price) || null,
			reference_id: purchase_order_id,
			reference_line_id: poItem.id,
		})),
	});

	// --- Phase 2: persist the GRN in SCM — compensate VCP if this fails ---
	const transaction = await sequelize.transaction();
	try {
		const grn = await GoodsReceiptNote.create(
			{
				org_id,
				purchase_order_id,
				grnPrefix: grnDetail.grnPrefix || null,
				grnNo: grnDetail.grnNumber || null,
				grnPostfix: grnDetail.grnPostfix || null,
				grn_date: grn_date || new Date(),
				remarks: remarks || null,
				received_by: req.user ? { id: req.user.id, name: req.user.name, email: req.user.email } : null,
			},
			{ transaction },
		);

		for (const { poItem, input, effectiveReceivedQty, qcInspectionItemId } of linesToReceive) {
			await GoodsReceiptNoteItem.create(
				{
					goods_receipt_note_id: grn.id,
					purchase_order_item_id: poItem.id,
					product_id: poItem.product_id,
					batch_id: poItem.batch_id || null,
					stock_type: poItem.stock_type,
					received_qty: effectiveReceivedQty,
					serial_nos: input.serial_nos || null,
					qc_inspection_item_id: qcInspectionItemId,
				},
				{ transaction },
			);
		}

		await transaction.commit();

		// Re-issuing any pending indent qty against this PO's indent is a deliberate,
		// user-initiated action (POST /indents/:id/reissue/preview then /reissue) — not
		// triggered automatically here, so a GRN can be cancelled without silently leaving
		// an indent's re-issue un-reversed against stock that's no longer there.
		return grn;
	} catch (scmError) {
		await transaction.rollback();
		logger.error('SCM GRN persist failed after VCP stock receipt — attempting rollback', { scmError });

		try {
			await callVcpStockEndpoint(req, '/rollback-receive-stock', {
				idempotencyKey: receiptIdempotencyKey,
				items: linesToReceive.map(({ poItem, input }) => ({
					product_id: poItem.product_id,
					batch_id: poItem.batch_id || null,
					qty: parseFloat(input.received_qty || 0),
					selected_uom_id: poItem.selected_uom_id || null,
					serial_nos: input.serial_nos || undefined,
					reference_id: purchase_order_id,
					reference_line_id: poItem.id,
				})),
			});
		} catch (rollbackError) {
			logger.error('CRITICAL: VCP rollback-receive-stock failed. Stock received but GRN NOT recorded. Manual correction required.', {
				purchase_order_id,
				items,
				rollbackError,
			});
		}

		throw scmError;
	}
};

exports.getAllGRNs = async (req) => {
	const { org_id } = req.user;
	const { from_date, to_date, limit, offset } = req.query;

	const where = { org_id };
	if (from_date || to_date) {
		where.grn_date = {};
		if (from_date) where.grn_date[Op.gte] = from_date;
		if (to_date) where.grn_date[Op.lte] = to_date;
	}

	return GoodsReceiptNote.findAndCountAll({
		where,
		include: [
			{ model: GoodsReceiptNoteItem, as: 'items' },
			{ model: PurchaseOrder, as: 'purchaseOrder', attributes: ['id', 'poPrefix', 'poNo', 'poPostfix', 'vendorInfo'] },
		],
		order: [['createdAt', 'DESC']],
		limit: limit ? parseInt(limit, 10) : 20,
		offset: offset ? parseInt(offset, 10) : 0,
	});
};

exports.cancelGRN = async (req, id) => {
	const { org_id } = req.user;
	const grn = await GoodsReceiptNote.findOne({
		where: { id, org_id },
		include: [
			{
				model: GoodsReceiptNoteItem,
				as: 'items',
				include: [{ model: PurchaseOrderItem, as: 'purchaseOrderItem', attributes: ['id', 'selected_uom_id'] }],
			},
		],
	});
	if (!grn) throw new AppError('Goods Receipt Note not found', StatusCodes.NOT_FOUND);
	if (grn.status === 'cancelled') {
		throw new AppError('This Goods Receipt Note is already cancelled', StatusCodes.BAD_REQUEST);
	}

	const rollbackItems = grn.items.map((item) => ({
		product_id: item.product_id,
		batch_id: item.batch_id || null,
		qty: parseFloat(item.received_qty || 0),
		selected_uom_id: item.purchaseOrderItem?.selected_uom_id || null,
		serial_nos: item.serial_nos || undefined,
		reference_id: grn.purchase_order_id,
		reference_line_id: item.purchase_order_item_id,
	}));

	// --- Phase 1: reverse the receipt in VCP's stock ledger ---
	const cancelIdempotencyKey = `GRN-CANCEL-${grn.id}-${crypto.randomUUID()}`;
	await callVcpStockEndpoint(req, '/rollback-receive-stock', {
		idempotencyKey: cancelIdempotencyKey,
		items: rollbackItems,
	});

	// --- Phase 2: mark the GRN cancelled in SCM — re-receive in VCP if this fails ---
	try {
		await grn.update({
			status: 'cancelled',
			cancelled_at: new Date(),
			cancelled_by: req.user ? { id: req.user.id, name: req.user.name, email: req.user.email } : null,
		});
		return grn;
	} catch (scmError) {
		logger.error('SCM GRN cancel persist failed after VCP stock rollback — attempting to restore stock', { scmError });

		try {
			await callVcpStockEndpoint(req, '/receive-stock', {
				idempotencyKey: `${cancelIdempotencyKey}-restore`,
				items: rollbackItems,
			});
		} catch (restoreError) {
			logger.error('CRITICAL: VCP receive-stock restore failed after a failed GRN cancel. Stock was rolled back but GRN NOT marked cancelled. Manual correction required.', {
				grnId: grn.id,
				restoreError,
			});
		}

		throw scmError;
	}
};

exports.getGRNsByPurchaseOrder = async (req, purchaseOrderId) => {
	const { org_id } = req.user;
	const po = await PurchaseOrder.findOne({ where: { id: purchaseOrderId, org_id } });
	if (!po) throw new AppError('Purchase Order not found', StatusCodes.NOT_FOUND);

	return GoodsReceiptNote.findAll({
		where: { purchase_order_id: purchaseOrderId },
		include: [{ model: GoodsReceiptNoteItem, as: 'items' }],
		order: [['createdAt', 'DESC']],
	});
};

exports.getGRNById = async (req, id) => {
	const { org_id } = req.user;
	const grn = await GoodsReceiptNote.findOne({
		where: { id, org_id },
		include: [{ model: GoodsReceiptNoteItem, as: 'items' }, { model: PurchaseOrder, as: 'purchaseOrder' }],
	});
	if (!grn) throw new AppError('Goods Receipt Note not found', StatusCodes.NOT_FOUND);
	return grn;
};
