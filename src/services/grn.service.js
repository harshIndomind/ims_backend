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
const { shortCloseRequestItemsRepository } = require('../repository/index');
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
		throw new AppError('MRN must include at least one item', StatusCodes.BAD_REQUEST);
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
				`Cannot create an MRN from QC inspection ${qcItem.inspection.qc_no} — it is "${qcItem.inspection.status}", not approved`,
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
	const vcpReceipt = await callVcpStockEndpoint(req, '/receive-stock', {
		idempotencyKey: receiptIdempotencyKey,
		items: linesToReceive.map(({ poItem, input }) => ({
			product_id: poItem.product_id,
			batch_id: poItem.batch_id || input.batch_id || null,
			batch_no: input.batch_no || undefined,
			mfd: input.mfd || undefined,
			expiry_date: input.expiry_date || undefined,
			sell_price: input.sell_price != null ? parseFloat(input.sell_price) : undefined,
			qty: parseFloat(input.received_qty || 0),
			selected_uom_id: poItem.selected_uom_id || null,
			serial_nos: input.serial_nos || undefined,
			rate: parseFloat(poItem.price) || null,
			reference_id: purchase_order_id,
			reference_line_id: poItem.id,
		})),
	});

	// VCP returns the resolved batch_id for each line (including newly created batches).
	const resolvedBatchIds = (vcpReceipt.results || []).map((r) => r.batch_id || null);

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

		for (const [i, { poItem, input, effectiveReceivedQty, qcInspectionItemId }] of linesToReceive.entries()) {
			await GoodsReceiptNoteItem.create(
				{
					goods_receipt_note_id: grn.id,
					purchase_order_item_id: poItem.id,
					product_id: poItem.product_id,
					batch_id: resolvedBatchIds[i] || poItem.batch_id || input.batch_id || null,
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
		logger.error('SCM MRN persist failed after VCP stock receipt — attempting rollback', { scmError });

		try {
			await callVcpStockEndpoint(req, '/rollback-receive-stock', {
				idempotencyKey: receiptIdempotencyKey,
				items: linesToReceive.map(({ poItem, input }, i) => ({
					product_id: poItem.product_id,
					batch_id: resolvedBatchIds[i] || poItem.batch_id || input.batch_id || null,
					qty: parseFloat(input.received_qty || 0),
					selected_uom_id: poItem.selected_uom_id || null,
					serial_nos: input.serial_nos || undefined,
					reference_id: purchase_order_id,
					reference_line_id: poItem.id,
				})),
			});
		} catch (rollbackError) {
			logger.error('CRITICAL: VCP rollback-receive-stock failed. Stock received but MRN NOT recorded. Manual correction required.', {
				purchase_order_id,
				items,
				rollbackError,
			});
		}

		throw scmError;
	}
};

// Drives the Create GRN screen's receivable-lines list. Non-QC POs behave exactly as before
// (ordered qty minus already-received across active GRNs, per PO item). QC-required POs are
// sourced from *approved* qc_inspection_items instead — one line per QC round still holding
// undrawn accepted_qty — because a single PO item can carry several QC rounds (partial
// deliveries / re-inspections) each independently capped; collapsing to one row per PO item
// would lose which specific QC round a receipt should be traced back to. Rejected qty is never
// receivable and is surfaced only for context.
exports.getReceivableLinesForPurchaseOrder = async (req, purchaseOrderId) => {
	const { org_id } = req.user;
	const po = await PurchaseOrder.findOne({
		where: { id: purchaseOrderId, org_id },
		include: [{ model: PurchaseOrderItem, as: 'items' }],
	});
	if (!po) throw new AppError('Purchase Order not found', StatusCodes.NOT_FOUND);

	async function alreadyReceivedFor(where) {
		return parseFloat(
			(await GoodsReceiptNoteItem.sum('received_qty', {
				where,
				include: [{ model: GoodsReceiptNote, as: 'goodsReceiptNote', attributes: [], where: { status: 'active' } }],
			})) || 0,
		);
	}

	if (!po.po_qc_check) {
		const lines = await Promise.all(
			po.items.map(async (item) => {
				const alreadyReceived = await alreadyReceivedFor({ purchase_order_item_id: item.id });
				const orderedQty = parseFloat(item.qty);
				return {
					purchase_order_item_id: item.id,
					qc_inspection_item_id: null,
					qc_no: null,
					product_id: item.product_id,
					product_name: item.productSnapshot?.name || null,
					stock_type: item.stock_type,
					batch_id: item.batch_id,
					ordered_qty: orderedQty,
					accepted_qty: null,
					rejected_qty: null,
					already_received_qty: alreadyReceived,
					remaining_qty: Math.max(0, orderedQty - alreadyReceived),
				};
			}),
		);
		return { po_qc_check: false, lines: lines.filter((l) => l.remaining_qty > 0.001), awaiting_qc: [] };
	}

	const poItemsById = new Map(po.items.map((i) => [i.id, i]));
	const qcItems = await QcInspectionItem.findAll({
		where: { po_wo_item_id: { [Op.in]: po.items.map((i) => i.id) } },
		include: [
			{
				model: QcInspection,
				as: 'inspection',
				where: { document_type: 'purchase_order', document_id: po.id, status: 'approved' },
			},
		],
	});

	const lines = await Promise.all(
		qcItems.map(async (qcItem) => {
			const poItem = poItemsById.get(qcItem.po_wo_item_id);
			const alreadyDrawn = await alreadyReceivedFor({ qc_inspection_item_id: qcItem.id });
			const acceptedQty = parseFloat(qcItem.accepted_qty);
			return {
				purchase_order_item_id: poItem.id,
				qc_inspection_item_id: qcItem.id,
				qc_no: qcItem.inspection.qc_no,
				product_id: qcItem.product_id,
				product_name: qcItem.productSnapshot?.name || null,
				stock_type: qcItem.stock_type,
				batch_id: qcItem.batch_id,
				ordered_qty: parseFloat(poItem.qty),
				accepted_qty: acceptedQty,
				rejected_qty: parseFloat(qcItem.rejected_qty),
				already_received_qty: alreadyDrawn,
				remaining_qty: Math.max(0, acceptedQty - alreadyDrawn),
			};
		}),
	);
	const receivable = lines.filter((l) => l.remaining_qty > 0.001);

	// PO items with no receivable line fall into distinct situations that must not be conflated
	// under one "awaiting QC" message:
	//  - awaiting_qc: no approved QC round exists yet for this item at all.
	//  - fully_received: approved QC exists and its accepted_qty has been fully drawn into GRNs,
	//    and that accepted_qty already covers the full ordered_qty — nothing more is expected.
	//  - short_closed: Σaccepted_qty + Σapproved-short-close covers the full ordered_qty — same
	//    "nothing more expected" outcome as fully_received, just settled via Short Close instead
	//    of (or in addition to) physical receipt, rather than every unit being received.
	//  - gap_needs_resolution: approved QC is fully drawn and Σaccepted_qty + Σshort-closed is
	//    still short of ordered_qty (typically because some qty was rejected and neither
	//    resupplied nor short-closed) — needs another QC round against a fresh delivery, or a
	//    Short Close, to settle the shortfall. Mirrors short-close.service.js's
	//    computeRemainingForItem formula (ordered − accepted − short-closed) so this screen and
	//    the Short Close screen never disagree about whether a line is still open.
	const receivablePoItemIds = new Set(receivable.map((l) => l.purchase_order_item_id));
	const linesByPoItemId = new Map();
	for (const line of lines) {
		if (!linesByPoItemId.has(line.purchase_order_item_id)) linesByPoItemId.set(line.purchase_order_item_id, []);
		linesByPoItemId.get(line.purchase_order_item_id).push(line);
	}
	const awaiting_qc = await Promise.all(
		po.items
			.filter((item) => !receivablePoItemIds.has(item.id))
			.map(async (item) => {
				const orderedQty = parseFloat(item.qty);
				const itemQcLines = linesByPoItemId.get(item.id) || [];
				const totalAcceptedQty = itemQcLines.reduce((sum, l) => sum + l.accepted_qty, 0);
				const shortClosedQty = parseFloat(
					await shortCloseRequestItemsRepository.sumApprovedQtyForPoWoItem(item.id),
				);
				let status;
				if (itemQcLines.length === 0) status = 'awaiting_qc';
				else if (totalAcceptedQty >= orderedQty - 0.001) status = 'fully_received';
				else if (totalAcceptedQty + shortClosedQty >= orderedQty - 0.001) status = 'short_closed';
				else status = 'gap_needs_resolution';
				return {
					purchase_order_item_id: item.id,
					product_id: item.product_id,
					product_name: item.productSnapshot?.name || null,
					ordered_qty: orderedQty,
					accepted_qty: totalAcceptedQty,
					short_closed_qty: shortClosedQty,
					status,
				};
			}),
	);

	return { po_qc_check: true, lines: receivable, awaiting_qc };
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
			{ model: PurchaseOrder, as: 'purchaseOrder', attributes: ['id', 'doc_number', 'poPrefix', 'poNo', 'poPostfix', 'vendorInfo'] },
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
		logger.error('SCM MRN cancel persist failed after VCP stock rollback — attempting to restore stock', { scmError });

		try {
			await callVcpStockEndpoint(req, '/receive-stock', {
				idempotencyKey: `${cancelIdempotencyKey}-restore`,
				items: rollbackItems,
			});
		} catch (restoreError) {
			logger.error('CRITICAL: VCP receive-stock restore failed after a failed MRN cancel. Stock was rolled back but MRN NOT marked cancelled. Manual correction required.', {
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
