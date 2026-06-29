'use strict';

jest.mock('undici', () => ({ fetch: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }));

const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
const mockGoodsReceiptNote = { create: jest.fn(), findOne: jest.fn() };
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

describe('createGRN — no longer touches indents', () => {
	it('creates the GRN without calling any indent re-issue logic, even when the PO has a linked indent', async () => {
		PurchaseOrder.findOne.mockResolvedValue(poWithItems());
		fetch.mockResolvedValueOnce(vcpOkResponse()); // /receive-stock
		GoodsReceiptNote.create.mockResolvedValue({ id: 900 });

		const req = baseReq([{ purchase_order_item_id: 200, received_qty: 10 }]);
		const grn = await grnService.createGRN(req);

		expect(grn).toEqual({ id: 900 });
		expect(mockTransaction.rollback).not.toHaveBeenCalled();
		// Only one VCP call (the receipt itself) — no second call for a re-issue.
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('creates the GRN the same way when the PO has no linked indent', async () => {
		PurchaseOrder.findOne.mockResolvedValue(poWithItems({ indent_id: null }));
		fetch.mockResolvedValueOnce(vcpOkResponse());
		GoodsReceiptNote.create.mockResolvedValue({ id: 902 });

		const req = baseReq([{ purchase_order_item_id: 200, received_qty: 10 }]);
		const grn = await grnService.createGRN(req);

		expect(grn).toEqual({ id: 902 });
	});
});

describe('createGRN — forwards the PO line UOM to VCP (fixes the zero-conversion bug)', () => {
	it('includes selected_uom_id in the /receive-stock payload', async () => {
		PurchaseOrder.findOne.mockResolvedValue(
			poWithItems({
				items: [
					{ id: 200, product_id: 1, batch_id: null, stock_type: 'normal', qty: 100, price: 5000, selected_uom_id: 60, productSnapshot: { name: 'Cable' } },
				],
			}),
		);
		fetch.mockResolvedValueOnce(vcpOkResponse());
		GoodsReceiptNote.create.mockResolvedValue({ id: 903 });

		// "2 Roll" against a PO line where 1 Roll = 50 Meter — previously this sent
		// no UOM context at all, so VCP posted baseUomQty=2 (as if 2 Meter).
		const req = baseReq([{ purchase_order_item_id: 200, received_qty: 2 }]);
		await grnService.createGRN(req);

		expect(fetch).toHaveBeenCalledTimes(1);
		const [, options] = fetch.mock.calls[0];
		const body = JSON.parse(options.body);
		expect(body.items[0].selected_uom_id).toBe(60);
		expect(body.items[0].qty).toBe(2);
	});

	it('sends selected_uom_id: null when the PO line has no UOM selected', async () => {
		PurchaseOrder.findOne.mockResolvedValue(poWithItems()); // no selected_uom_id on the fixture item
		fetch.mockResolvedValueOnce(vcpOkResponse());
		GoodsReceiptNote.create.mockResolvedValue({ id: 904 });

		const req = baseReq([{ purchase_order_item_id: 200, received_qty: 10 }]);
		await grnService.createGRN(req);

		const [, options] = fetch.mock.calls[0];
		const body = JSON.parse(options.body);
		expect(body.items[0].selected_uom_id).toBeNull();
	});
});

describe("cancelGRN — reverses using the linked PO item's UOM, not the raw qty", () => {
	it('forwards the PurchaseOrderItem.selected_uom_id (via the included association) to /rollback-receive-stock', async () => {
		GoodsReceiptNote.findOne.mockResolvedValue({
			id: 77,
			status: 'active',
			purchase_order_id: 50,
			items: [
				{
					product_id: 1,
					batch_id: null,
					received_qty: 2,
					serial_nos: null,
					purchase_order_item_id: 200,
					purchaseOrderItem: { id: 200, selected_uom_id: 60 },
				},
			],
			update: jest.fn().mockResolvedValue(undefined),
		});
		fetch.mockResolvedValueOnce(vcpOkResponse()); // /rollback-receive-stock

		await grnService.cancelGRN({ user: { org_id: 1 }, cookies: { accessToken: 'tok' } }, 77);

		expect(fetch).toHaveBeenCalledTimes(1);
		const [, options] = fetch.mock.calls[0];
		const body = JSON.parse(options.body);
		expect(body.items[0].selected_uom_id).toBe(60);
	});
});
