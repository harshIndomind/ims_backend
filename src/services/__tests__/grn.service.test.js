'use strict';

jest.mock('undici', () => ({ fetch: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }));
jest.mock('../indent.service', () => ({ reissuePendingQuantity: jest.fn() }));

const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
const mockGoodsReceiptNote = { create: jest.fn() };
const mockGoodsReceiptNoteItem = { create: jest.fn(), sum: jest.fn().mockResolvedValue(0) };
const mockPurchaseOrder = { findOne: jest.fn() };

jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
	GoodsReceiptNote: mockGoodsReceiptNote,
	GoodsReceiptNoteItem: mockGoodsReceiptNoteItem,
	PurchaseOrder: mockPurchaseOrder,
	PurchaseOrderItem: {},
}));

const { sequelize, GoodsReceiptNote, GoodsReceiptNoteItem, PurchaseOrder } = require('../../models/index');
const { fetch } = require('undici');
const indentService = require('../indent.service');
const grnService = require('../grn.service');

function vcpOkResponse(body = {}) {
	return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
	jest.clearAllMocks();
	sequelize.transaction.mockResolvedValue(mockTransaction);
	GoodsReceiptNoteItem.sum.mockResolvedValue(0);
});

function baseReq(items) {
	return {
		user: { id: 1, org_id: 1, name: 'A', email: 'a@x.com' },
		cookies: { accessToken: 'tok' },
		body: {
			purchase_order_id: 50,
			grn_date: '2026-06-27',
			items,
		},
	};
}

function poWithItems(overrides = {}) {
	return {
		id: 50,
		indent_id: 7,
		items: [
			{ id: 200, product_id: 1, batch_id: null, stock_type: 'normal', qty: 10, price: 100, productSnapshot: { name: 'Widget' } },
		],
		...overrides,
	};
}

describe('createGRN — re-issue hook', () => {
	it('triggers reissuePendingQuantity for the PO\'s indent after a successful GRN', async () => {
		PurchaseOrder.findOne.mockResolvedValue(poWithItems());
		fetch.mockResolvedValueOnce(vcpOkResponse()); // /receive-stock
		GoodsReceiptNote.create.mockResolvedValue({ id: 900 });
		indentService.reissuePendingQuantity.mockResolvedValue({ indent_id: 7, reissued: [] });

		const req = baseReq([{ purchase_order_item_id: 200, received_qty: 10 }]);
		const grn = await grnService.createGRN(req);

		expect(grn).toEqual({ id: 900 });
		expect(indentService.reissuePendingQuantity).toHaveBeenCalledWith(req, 7);
		expect(mockTransaction.rollback).not.toHaveBeenCalled();
	});

	it('does not fail GRN creation when re-issue throws — stock was already received and the GRN is already recorded', async () => {
		PurchaseOrder.findOne.mockResolvedValue(poWithItems());
		fetch.mockResolvedValueOnce(vcpOkResponse());
		GoodsReceiptNote.create.mockResolvedValue({ id: 901 });
		indentService.reissuePendingQuantity.mockRejectedValue(new Error('VCP unreachable'));

		const req = baseReq([{ purchase_order_item_id: 200, received_qty: 10 }]);
		const grn = await grnService.createGRN(req);

		expect(grn).toEqual({ id: 901 });
	});

	it('skips the re-issue call when the PO has no linked indent', async () => {
		PurchaseOrder.findOne.mockResolvedValue(poWithItems({ indent_id: null }));
		fetch.mockResolvedValueOnce(vcpOkResponse());
		GoodsReceiptNote.create.mockResolvedValue({ id: 902 });

		const req = baseReq([{ purchase_order_item_id: 200, received_qty: 10 }]);
		await grnService.createGRN(req);

		expect(indentService.reissuePendingQuantity).not.toHaveBeenCalled();
	});
});
