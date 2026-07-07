'use strict';

// purchase-order.service.js pulls in PDF/S3/gRPC machinery at module load time that has
// nothing to do with the qty_for_purchase_order logic under test — stub all of it so
// requiring the module here doesn't try to launch puppeteer, hit S3, or load real gRPC protos.
jest.mock('../../pdf/htmlPdfGenerator', () => ({
	generateInvoiceHTMLPDF: jest.fn(),
	generateInvoiceHTML: jest.fn(),
}));
jest.mock('../../utils/s3Bucket', () => ({
	generateSignedUrl: jest.fn(),
}));
jest.mock('../../grpc/clients/product.client', () => ({}));
jest.mock('../../grpc/clients/productUom.client', () => ({}));
jest.mock('undici', () => ({ fetch: jest.fn() }));
jest.mock('../auditLog.service', () => ({ record: jest.fn().mockResolvedValue(undefined) }));

const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };

// PurchaseOrderItem.findAll is used by updatePurchaseOrder to enumerate current items.
const mockPoItemFindAll = jest.fn();
// Indent.findOne is used to retrieve budgetType for qty validation.
const mockIndentFindOne = jest.fn();
// IndentItem.findOne is used by applyIndentQtyDelta to get the UOM-specific row.
const mockIndentItemFindOne = jest.fn();

jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
	User: {},
	organization: {},
	PurchaseOrder: {},
	PurchaseOrderItem: { findAll: mockPoItemFindAll },
	IndentItem: { findOne: mockIndentItemFindOne },
	Indent: { findOne: mockIndentFindOne },
	Role: {},
	PaymentRequisition: { destroy: jest.fn() },
	MasterTermsCondition: {},
	MasterUnit: {},
}));

jest.mock('../../repository/index', () => ({
	purchaseOrderRepository: { create: jest.fn(), findById: jest.fn(), update: jest.fn() },
	purchaseOrderItemsRepository: { create: jest.fn(), findOne: jest.fn(), update: jest.fn() },
	purchaseOrderSerialItemsRepository: {},
	IndentItemRepository: { increment: jest.fn() },
}));

const { sequelize } = require('../../models/index');
const {
	purchaseOrderRepository: poRepo,
	purchaseOrderItemsRepository: poItemRepo,
	IndentItemRepository: indentItemRepo,
} = require('../../repository/index');
const poService = require('../purchase-order.service');

// qty_for_purchase_order is the live "still open for PO" balance — PO create/update/delete
// mutate it directly (this is unchanged from before this feature: see balance_indent_qty,
// which is a *separate* counter for post-receipt re-issue, not touched by PO actions at all).
function baseProductItem(overrides = {}) {
	return {
		product_id: 1,
		budget_id: 1,
		productSnapshot: { name: 'Widget' },
		budget_no: 'B-1',
		batch_id: null,
		qty: 6,
		qty_for_purchase_order: 10,
		price: 100,
		discount: 0,
		discount_price_type: 'percent',
		tax_id: 1,
		igst: 0,
		cgst: 0,
		sgst: 0,
		cess: 0,
		total: 600,
		stock_type: 'normal',
		note: '',
		selected_uom_id: null,
		specification: '',
		...overrides,
	};
}

// A fake existing PO item returned by PurchaseOrderItem.findAll in update scenarios.
function makeExistingPoItem(overrides = {}) {
	return {
		id: 200,
		purchase_order_id: 100,
		product_id: 1,
		qty: 6,
		uomSnapshot: null,
		destroy: jest.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	sequelize.transaction.mockResolvedValue(mockTransaction);
	// Default: no existing PO items (override per test as needed).
	mockPoItemFindAll.mockResolvedValue([]);
	// Default: item-wise indent (qty validation active). Override per test for value-wise.
	mockIndentFindOne.mockResolvedValue({ budgetType: 'item-wise' });
	// Default: one IndentItem row, base UOM (uomQty=1) — so per-row delta === base delta.
	// Tests that need a different UOM override this.
	mockIndentItemFindOne.mockResolvedValue({ id: 999, uomSnapshot: null });
});

// ─── createPurchaseOrder ──────────────────────────────────────────────────────

describe('createPurchaseOrder — qty_for_purchase_order', () => {
	const reqBase = {
		user: { org_id: 1 },
		body: {
			indent_id: 5,
			purchaseOrderDetail: {},
			vendorInfo: {},
		},
	};

	it('rejects when PO qty exceeds the remaining qty_for_purchase_order', async () => {
		const req = { ...reqBase, body: { ...reqBase.body, productItems: [baseProductItem({ qty: 15, qty_for_purchase_order: 10 })] } };

		await expect(poService.createPurchaseOrder(req, req.body)).rejects.toThrow(/exceeds available indent qty/);
		expect(poItemRepo.create).not.toHaveBeenCalled();
	});

	it('allows a partial PO within qty_for_purchase_order and decrements it by the PO qty', async () => {
		poRepo.create.mockResolvedValue({ id: 100 });
		poItemRepo.create.mockResolvedValue({ id: 200 });
		const req = { ...reqBase, body: { ...reqBase.body, productItems: [baseProductItem({ qty: 6, qty_for_purchase_order: 10 })] } };

		await poService.createPurchaseOrder(req, req.body);

		// applyIndentQtyDelta fetches the UOM-specific IndentItem row then increments by id.
		expect(mockIndentItemFindOne).toHaveBeenCalledWith(
			expect.objectContaining({ where: { indent_id: 5, product_id: 1, uom_id: null } }),
		);
		expect(indentItemRepo.increment).toHaveBeenCalledWith(
			{ qty_for_purchase_order: -6 },
			expect.objectContaining({ where: { id: 999 } }),
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	it('allows a second partial PO that exactly drains the remaining balance to 0', async () => {
		poRepo.create.mockResolvedValue({ id: 101 });
		poItemRepo.create.mockResolvedValue({ id: 201 });
		// First PO already consumed 6 of an original 10 — caller now sends the live balance (4).
		const req = { ...reqBase, body: { ...reqBase.body, productItems: [baseProductItem({ qty: 4, qty_for_purchase_order: 4 })] } };

		await poService.createPurchaseOrder(req, req.body);

		expect(indentItemRepo.increment).toHaveBeenCalledWith(
			{ qty_for_purchase_order: -4 },
			expect.anything(),
		);
	});

	it('rejects any further PO once qty_for_purchase_order is 0', async () => {
		const req = { ...reqBase, body: { ...reqBase.body, productItems: [baseProductItem({ qty: 1, qty_for_purchase_order: 0 })] } };

		await expect(poService.createPurchaseOrder(req, req.body)).rejects.toThrow(/exceeds available indent qty/);
	});

	it('never touches balance_indent_qty (that belongs to the re-issue flow, not PO creation)', async () => {
		poRepo.create.mockResolvedValue({ id: 102 });
		poItemRepo.create.mockResolvedValue({ id: 202 });
		const req = { ...reqBase, body: { ...reqBase.body, productItems: [baseProductItem({ qty: 6, qty_for_purchase_order: 10 })] } };

		await poService.createPurchaseOrder(req, req.body);

		for (const call of indentItemRepo.increment.mock.calls) {
			expect(call[0]).not.toHaveProperty('balance_indent_qty');
		}
	});

	// ── Value-wise tests ──────────────────────────────────────────────────────

	it('allows any qty for a value-wise indent regardless of qty_for_purchase_order', async () => {
		mockIndentFindOne.mockResolvedValue({ budgetType: 'value-wise' });
		poRepo.create.mockResolvedValue({ id: 104 });
		poItemRepo.create.mockResolvedValue({ id: 204 });
		// qty=50 far exceeds qty_for_purchase_order=10, but value-wise skips the qty cap.
		const req = { ...reqBase, body: { ...reqBase.body, productItems: [baseProductItem({ qty: 50, qty_for_purchase_order: 10 })] } };

		await poService.createPurchaseOrder(req, req.body);

		expect(poItemRepo.create).toHaveBeenCalledTimes(1);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	it('still rejects duplicate UOM on a value-wise indent', async () => {
		mockIndentFindOne.mockResolvedValue({ budgetType: 'value-wise' });
		const items = [
			baseProductItem({ qty: 10, selected_uom_id: 5, qty_for_purchase_order: 100 }),
			baseProductItem({ qty: 20, selected_uom_id: 5, qty_for_purchase_order: 100 }),
		];
		const req = { ...reqBase, body: { ...reqBase.body, productItems: items } };

		await expect(poService.createPurchaseOrder(req, req.body)).rejects.toThrow(/duplicate UOM/);
		expect(poItemRepo.create).not.toHaveBeenCalled();
	});

	// ── Multi-UOM tests ───────────────────────────────────────────────────────

	it('allows two lines for the same product with different UOMs', async () => {
		poRepo.create.mockResolvedValue({ id: 103 });
		poItemRepo.create.mockResolvedValue({ id: 203 });
		// product_id=1 appears twice: once as base unit (uom_id=null) and once as box (uom_id=5).
		// Total base qty: 2 (base) + 2/10 (box → 0.2 base each unit) = 2.2, well under limit of 10.
		const items = [
			baseProductItem({ qty: 2, selected_uom_id: null, uomSnapshot: null, qty_for_purchase_order: 10 }),
			baseProductItem({ qty: 2, selected_uom_id: 5, uomSnapshot: { qty: 10 }, qty_for_purchase_order: 10 }),
		];
		const req = { ...reqBase, body: { ...reqBase.body, productItems: items } };

		await poService.createPurchaseOrder(req, req.body);

		// Two create calls — one per item.
		expect(poItemRepo.create).toHaveBeenCalledTimes(2);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	it('rejects two lines for the same product with the same UOM', async () => {
		const items = [
			baseProductItem({ qty: 2, selected_uom_id: 5, qty_for_purchase_order: 10 }),
			baseProductItem({ qty: 3, selected_uom_id: 5, qty_for_purchase_order: 10 }),
		];
		const req = { ...reqBase, body: { ...reqBase.body, productItems: items } };

		await expect(poService.createPurchaseOrder(req, req.body)).rejects.toThrow(/duplicate UOM/);
		expect(poItemRepo.create).not.toHaveBeenCalled();
	});

	it('rejects when multi-UOM lines for same product together exceed qty_for_purchase_order', async () => {
		// Two lines with conversion factor 1 (uomSnapshot=null); qtys 6+5=11 > limit 10.
		const items = [
			baseProductItem({ qty: 6, selected_uom_id: null, uomSnapshot: null, qty_for_purchase_order: 10 }),
			baseProductItem({ qty: 5, selected_uom_id: 5, uomSnapshot: null, qty_for_purchase_order: 10 }),
		];
		const req = { ...reqBase, body: { ...reqBase.body, productItems: items } };

		await expect(poService.createPurchaseOrder(req, req.body)).rejects.toThrow(/exceeds available indent qty/);
		expect(poItemRepo.create).not.toHaveBeenCalled();
	});
});

// ─── updatePurchaseOrder ──────────────────────────────────────────────────────

describe('updatePurchaseOrder — qty_for_purchase_order', () => {
	// Validation compares the new qty against the payload's qty_for_purchase_order (the value
	// currently in the DB, which does not yet include this same PO item's own qty being
	// restored), so the new qty here must be <= the pre-restore balance to pass validation.
	const baseReq = {
		params: { id: 100 },
		body: {
			indent_id: 5,
			purchaseOrderDetail: {},
			vendorInfo: {},
		},
	};

	it('restores the old PO item qty then decrements by the new qty (net delta)', async () => {
		const existing = makeExistingPoItem({ id: 200, qty: 6, product_id: 1 });
		mockPoItemFindAll.mockResolvedValue([existing]);
		poRepo.findById.mockResolvedValue({ id: 100 });
		poItemRepo.update.mockResolvedValue(existing);

		const req = {
			...baseReq,
			body: {
				...baseReq.body,
				// item carries its DB id so the service recognises it as an existing row
				productItems: [baseProductItem({ id: 200, qty: 4, qty_for_purchase_order: 4 })],
			},
		};

		await poService.updatePurchaseOrder(req);

		// Restore old qty (6), then decrement by new qty (4).
		expect(indentItemRepo.increment).toHaveBeenNthCalledWith(
			1,
			{ qty_for_purchase_order: 6 },
			expect.anything(),
		);
		expect(indentItemRepo.increment).toHaveBeenNthCalledWith(
			2,
			{ qty_for_purchase_order: -4 },
			expect.anything(),
		);
	});

	it('rejects when the new qty exceeds qty_for_purchase_order', async () => {
		mockPoItemFindAll.mockResolvedValue([]);
		poRepo.findById.mockResolvedValue({ id: 100 });

		const req = {
			...baseReq,
			body: {
				...baseReq.body,
				productItems: [baseProductItem({ qty: 50, qty_for_purchase_order: 4 })],
			},
		};

		await expect(poService.updatePurchaseOrder(req)).rejects.toThrow(/exceeds available indent qty/);
	});

	it('creates a new item when payload item has no id', async () => {
		mockPoItemFindAll.mockResolvedValue([]);
		poRepo.findById.mockResolvedValue({ id: 100 });
		poItemRepo.create.mockResolvedValue({ id: 300 });

		const req = {
			...baseReq,
			body: {
				...baseReq.body,
				// No id → treated as a new line item.
				productItems: [baseProductItem({ qty: 4, qty_for_purchase_order: 10 })],
			},
		};

		await poService.updatePurchaseOrder(req);

		expect(poItemRepo.create).toHaveBeenCalledTimes(1);
		expect(indentItemRepo.increment).toHaveBeenCalledWith(
			{ qty_for_purchase_order: -4 },
			expect.anything(),
		);
	});

	it('restores qty and destroys items removed from the payload', async () => {
		// DB has two items; payload only sends one back → the other must be removed.
		const kept = makeExistingPoItem({ id: 200, qty: 3, product_id: 1 });
		const removed = makeExistingPoItem({ id: 201, qty: 5, product_id: 2 });
		mockPoItemFindAll.mockResolvedValue([kept, removed]);
		poRepo.findById.mockResolvedValue({ id: 100 });
		poItemRepo.update.mockResolvedValue(kept);

		const req = {
			...baseReq,
			body: {
				...baseReq.body,
				productItems: [
					baseProductItem({ id: 200, product_id: 1, qty: 3, qty_for_purchase_order: 7 }),
				],
			},
		};

		await poService.updatePurchaseOrder(req);

		// Removed item qty should be restored and the row destroyed.
		// applyIndentQtyDelta fetches the UOM-specific IndentItem for product_id:2 then increments.
		expect(mockIndentItemFindOne).toHaveBeenCalledWith(
			expect.objectContaining({ where: { indent_id: 5, product_id: 2, uom_id: null } }),
		);
		expect(indentItemRepo.increment).toHaveBeenCalledWith(
			{ qty_for_purchase_order: 5 },
			expect.anything(),
		);
		expect(removed.destroy).toHaveBeenCalled();
	});

	it('allows updating a PO that now has two lines for the same product with different UOMs', async () => {
		// Existing DB: one line for product 1 (base UOM).
		const existing = makeExistingPoItem({ id: 200, qty: 2, product_id: 1 });
		mockPoItemFindAll.mockResolvedValue([existing]);
		poRepo.findById.mockResolvedValue({ id: 100 });
		poItemRepo.update.mockResolvedValue(existing);
		poItemRepo.create.mockResolvedValue({ id: 201 });

		// Payload: update existing line + add a new box line (different UOM).
		const req = {
			...baseReq,
			body: {
				...baseReq.body,
				productItems: [
					baseProductItem({ id: 200, qty: 2, selected_uom_id: null, qty_for_purchase_order: 10 }),
					baseProductItem({ qty: 1, selected_uom_id: 5, uomSnapshot: { qty: 10 }, qty_for_purchase_order: 10 }),
				],
			},
		};

		await poService.updatePurchaseOrder(req);

		expect(poItemRepo.update).toHaveBeenCalledTimes(1);
		expect(poItemRepo.create).toHaveBeenCalledTimes(1);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});
});

// ─── deletePurchaseOrder ──────────────────────────────────────────────────────

describe('deletePurchaseOrder — qty_for_purchase_order', () => {
	it('restores qty_for_purchase_order by each deleted PO item qty', async () => {
		const { PaymentRequisition } = require('../../models/index');
		poRepo.findById.mockResolvedValue({
			indent_id: 5,
			items: [{ product_id: 1, qty: 6, selected_uom_id: null }],
		});
		poRepo.delete = jest.fn();

		await poService.deletePurchaseOrder({ params: { id: 100 }, user: { org_id: 1, role: 'Admin' } });

		// applyIndentQtyDelta fetches the UOM-specific IndentItem for product_id:1 then increments.
		expect(mockIndentItemFindOne).toHaveBeenCalledWith(
			expect.objectContaining({ where: { indent_id: 5, product_id: 1, uom_id: null } }),
		);
		expect(indentItemRepo.increment).toHaveBeenCalledWith(
			{ qty_for_purchase_order: 6 },
			expect.objectContaining({ where: { id: 999 } }),
		);
		expect(PaymentRequisition.destroy).toHaveBeenCalled();
	});
});
