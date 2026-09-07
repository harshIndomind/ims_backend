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
jest.mock('../document-header-codes.service', () => ({
	resolveUnitAndMajorHeadCodes: jest.fn().mockResolvedValue({ unitShortCode: 'U1', majorHeadCode: 'M1' }),
}));
jest.mock('../document-numbering.service', () => ({
	generateDocumentNumber: jest.fn().mockResolvedValue({ docNumber: 'PO-1', sequenceNo: 1, fiscalYear: '2025-26' }),
}));

// LOCK.UPDATE mirrors real Sequelize transaction instances — budget-validation.service.js's
// row-locked IndentItem reads need it present even though these tests don't exercise locking
// semantics themselves (IndentItem.findOne resolves undefined by default here, so the new
// budget check no-ops before ever using the lock).
const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { UPDATE: 'UPDATE' } };

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
	// Referenced by budget-validation.service.js's WorkOrder-side commitment lookup — never
	// actually queried in these PO-only tests since IndentItem.findOne resolves undefined by
	// default, but must exist so the require() destructure doesn't blow up.
	WorkOrder: {},
	WorkOrderItem: { findAll: jest.fn().mockResolvedValue([]) },
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
	// indentQtyLog.service.js (invoked internally by applyIndentQtyDelta) pulls this from the
	// same repository index — must be present or it crashes with "not a function".
	indentItemQtyLogRepository: { create: jest.fn().mockResolvedValue({}) },
	documentChargesRepository: {
		getForDocument: jest.fn().mockResolvedValue([]),
		bulkReplaceForDocument: jest.fn().mockResolvedValue([]),
	},
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

	// ── Value-wise budget-AMOUNT tests (Indent → PO/WO, budget-validation.service.js) ──
	// Distinct from the qty-cap tests above: a value-wise indent skips the qty_for_purchase_order
	// cap entirely (see validateItemsLimits), so these are the only tests that exercise the
	// replacement amount-based cap.

	it("rejects a value-wise PO whose taxable amount exceeds the indent line's remaining budget", async () => {
		mockIndentFindOne.mockResolvedValue({ budgetType: 'value-wise' });
		mockIndentItemFindOne.mockResolvedValue({
			id: 999,
			indent_id: 5,
			product_id: 1,
			uom_id: null,
			item_name: 'Widget',
			budget_id: 7,
			amount: 500,
			indent: { id: 5, budgetType: 'value-wise' },
		});
		// baseProductItem: qty=6, price=100, no tax → taxable 600, over the 500 indent-line budget.
		// reqBase.user has no `roles` — fine for the other tests in this block, which never
		// reach the role gate before their own assertion point, but these three do run all the
		// way through to a real create, so they need a user that clears it (see the dedicated
		// `roles: ['org_admin']` req in the "charge-tax engine is authoritative" block below).
		const req = {
			...reqBase,
			user: { org_id: 1, roles: ['org_admin'] },
			body: { ...reqBase.body, productItems: [baseProductItem({ qty: 6, price: 100 })] },
		};

		await expect(poService.createPurchaseOrder(req, req.body)).rejects.toThrow(/Budget limit exceeded/);
		expect(poItemRepo.create).not.toHaveBeenCalled();
	});

	it("allows a value-wise PO whose taxable amount fits the indent line's budget", async () => {
		mockIndentFindOne.mockResolvedValue({ budgetType: 'value-wise' });
		mockIndentItemFindOne.mockResolvedValue({
			id: 999,
			indent_id: 5,
			product_id: 1,
			uom_id: null,
			item_name: 'Widget',
			budget_id: 7,
			amount: 1000,
			indent: { id: 5, budgetType: 'value-wise' },
		});
		poRepo.create.mockResolvedValue({ id: 105 });
		poItemRepo.create.mockResolvedValue({ id: 205 });
		// reqBase.user has no `roles` — fine for the other tests in this block, which never
		// reach the role gate before their own assertion point, but these three do run all the
		// way through to a real create, so they need a user that clears it (see the dedicated
		// `roles: ['org_admin']` req in the "charge-tax engine is authoritative" block below).
		const req = {
			...reqBase,
			user: { org_id: 1, roles: ['org_admin'] },
			body: { ...reqBase.body, productItems: [baseProductItem({ qty: 6, price: 100 })] },
		};

		await poService.createPurchaseOrder(req, req.body);

		expect(poItemRepo.create).toHaveBeenCalledTimes(1);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	it('lets a value-wise PO through unchecked when its IndentItem carries no budget_id', async () => {
		mockIndentFindOne.mockResolvedValue({ budgetType: 'value-wise' });
		mockIndentItemFindOne.mockResolvedValue({
			id: 999,
			indent_id: 5,
			product_id: 1,
			uom_id: null,
			budget_id: null,
			amount: 0,
			indent: { id: 5, budgetType: 'value-wise' },
		});
		poRepo.create.mockResolvedValue({ id: 106 });
		poItemRepo.create.mockResolvedValue({ id: 206 });
		// reqBase.user has no `roles` — fine for the other tests in this block, which never
		// reach the role gate before their own assertion point, but these three do run all the
		// way through to a real create, so they need a user that clears it (see the dedicated
		// `roles: ['org_admin']` req in the "charge-tax engine is authoritative" block below).
		const req = {
			...reqBase,
			user: { org_id: 1, roles: ['org_admin'] },
			body: { ...reqBase.body, productItems: [baseProductItem({ qty: 6, price: 100 })] },
		};

		await poService.createPurchaseOrder(req, req.body);

		expect(poItemRepo.create).toHaveBeenCalledTimes(1);
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

// ─── Charge + tax engine integration ──────────────────────────────────────────

describe('createPurchaseOrder — charge-tax engine is authoritative', () => {
	const { documentChargesRepository } = require('../../repository/index');

	const req = {
		user: { org_id: 1, roles: ['org_admin'] },
		body: {
			indent_id: 5,
			purchaseOrderDetail: {},
			vendorInfo: {},
			state_same: true,
			// Deliberately wrong client-sent totals — must be ignored, not persisted.
			total_taxable: 1,
			total_tax: 1,
			grandTotal: 1,
			productItems: [
				baseProductItem({
					qty: 1,
					price: 100000,
					discount: 0,
					qty_for_purchase_order: 10,
					taxSnapshot: { rate: 18 },
					igst: 999,
					cgst: 999,
					sgst: 999,
					total: 999,
				}),
			],
			charges: [
				{
					name: 'Freight',
					calculationType: 'FIXED',
					value: 2000,
					operation: '+',
					applyOn: 'NET_TAXABLE_AMOUNT',
					taxTreatment: 'SPECIFIC_RATE',
					taxRate: 18,
				},
			],
		},
	};

	it('recomputes totals server-side and persists document_charges, ignoring client-sent totals', async () => {
		mockIndentFindOne.mockResolvedValue({ budgetType: 'value-wise' });
		poRepo.create.mockResolvedValue({ id: 500 });
		poItemRepo.create.mockResolvedValue({ id: 900 });

		await poService.createPurchaseOrder(req, req.body);

		// item 100000@18% = 118000; freight 2000@18% = 2360 -> taxable 102000, tax 18360, grand 120360
		expect(poRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({ total_taxable: 102000, total_tax: 18360, grandTotal: 120360 }),
			expect.anything(),
		);
		// Per-item tax fields also come from the engine, not the (deliberately wrong) client values.
		expect(poItemRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({ igst: 0, cgst: 9000, sgst: 9000, total: 118000 }),
			expect.anything(),
		);
		expect(documentChargesRepository.bulkReplaceForDocument).toHaveBeenCalledWith(
			'purchase_order',
			500,
			expect.arrayContaining([
				expect.objectContaining({ name: 'Freight', taxable_amount: 2000, cgst: 180, sgst: 180, total: 2360 }),
			]),
			expect.anything(),
		);
	});
});

describe('getPurchaseOrderById — legacy customFields fall back to equivalent charges', () => {
	it('adapts legacy customFields into charges when no document_charges rows exist', async () => {
		const { documentChargesRepository, purchaseOrderRepository } = require('../../repository/index');
		documentChargesRepository.getForDocument.mockResolvedValue([]);
		purchaseOrderRepository.findOne = jest.fn().mockResolvedValue({
			get: () => ({
				id: 100,
				org_id: 1,
				items: [],
				customFields: [{ name: 'TCS', valueType: 'percentage', operationType: '+', amount: '5' }, null],
			}),
		});

		const response = await poService.getPurchaseOrderById({ params: { id: 100 }, user: { org_id: 1 } });

		expect(response.charges).toEqual([
			expect.objectContaining({ name: 'TCS', calculationType: 'PERCENTAGE', value: 5, applyOn: 'AFTER_TAX', taxTreatment: 'NON_TAXABLE' }),
		]);
	});
});
