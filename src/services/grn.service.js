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
} = require('../models/index');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const {
	VCP_SERVICE_API_BASE_URL,
	VCP_SERVICE_PRODUCT_ENDPOINT,
	S2S_COMM_KEY,
} = require('../config/serverConfig');
const indentService = require('./indent.service');

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

	// --- Phase 0: validate every line against the PO's ordered qty before touching anything ---
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

		linesToReceive.push({ poItem, input, effectiveReceivedQty });
	}

	// --- Phase 1: record the receipt in VCP's stock ledger (always succeeds — no availability check for a receipt) ---
	const receiptIdempotencyKey = `GRN-PO-${purchase_order_id}-${crypto.randomUUID()}`;
	await callVcpStockEndpoint(req, '/receive-stock', {
		idempotencyKey: receiptIdempotencyKey,
		items: linesToReceive.map(({ poItem, input }) => ({
			product_id: poItem.product_id,
			batch_id: poItem.batch_id || null,
			qty: parseFloat(input.received_qty || 0),
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

		for (const { poItem, input, effectiveReceivedQty } of linesToReceive) {
			await GoodsReceiptNoteItem.create(
				{
					goods_receipt_note_id: grn.id,
					purchase_order_item_id: poItem.id,
					product_id: poItem.product_id,
					batch_id: poItem.batch_id || null,
					stock_type: poItem.stock_type,
					received_qty: effectiveReceivedQty,
					serial_nos: input.serial_nos || null,
				},
				{ transaction },
			);
		}

		await transaction.commit();

		// Best-effort: stock has already landed in VCP and the GRN is recorded — a failure
		// here must not undo either. Any items that don't get picked up (re-issue throws,
		// or simply still have no available stock) stay pending and can be re-issued later,
		// either by another GRN or the manual POST /indents/:id/reissue endpoint.
		if (po.indent_id) {
			try {
				await indentService.reissuePendingQuantity(req, po.indent_id);
			} catch (reissueError) {
				logger.error('Re-issue after GRN failed — GRN recorded, indent left pending for manual/next-GRN re-issue', {
					purchase_order_id,
					indent_id: po.indent_id,
					grn_id: grn.id,
					reissueError,
				});
			}
		}

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
		include: [{ model: GoodsReceiptNoteItem, as: 'items' }],
	});
	if (!grn) throw new AppError('Goods Receipt Note not found', StatusCodes.NOT_FOUND);
	if (grn.status === 'cancelled') {
		throw new AppError('This Goods Receipt Note is already cancelled', StatusCodes.BAD_REQUEST);
	}

	const rollbackItems = grn.items.map((item) => ({
		product_id: item.product_id,
		batch_id: item.batch_id || null,
		qty: parseFloat(item.received_qty || 0),
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
