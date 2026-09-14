'use strict';

// work-order.service.js pulls in PDF/S3/document-numbering machinery at module load time
// that has nothing to do with the qty_for_purchase_order ledger under test here — stub all
// of it so requiring the module doesn't try to launch puppeteer, hit S3, or generate real
// document numbers. Mirrors purchase-order.service.test.js's mocking pattern.
jest.mock('../../pdf/htmlPdfGenerator', () => ({
	generateInvoiceHTMLPDF: jest.fn(),
	generateInvoiceHTML: jest.fn(),
}));
jest.mock('../../utils/s3Bucket', () => ({
	generateSignedUrl: jest.fn(),
	getImageAsBase64DataUrl: jest.fn(),
}));
jest.mock('undici', () => ({ fetch: jest.fn() }));
jest.mock('../auditLog.service', () => ({ record: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../document-header-codes.service', () => ({
	resolveUnitAndMajorHeadCodes: jest.fn().mockResolvedValue({ unitShortCode: 'U1', majorHeadCode: 'M1' }),
}));
jest.mock('../document-numbering.service', () => ({
	generateDocumentNumber: jest.fn().mockResolvedValue({ docNumber: 'WO-1', sequenceNo: 1, fiscalYear: '2025-26' }),
}));
jest.mock('../orderDispatch.service', () => ({
	deleteAllForDocument: jest.fn().mockResolvedValue([]),
	cleanupS3Documents: jest.fn().mockResolvedValue(undefined),
}));
// isEditable gates updateWorkOrder (same lock purchase-order.service.js's updatePurchaseOrder /
// indent.service.js's updateIndent use) — default true so every pre-existing update test keeps
// passing unless a test explicitly opts into the locked case. canActOnCurrentStage/
// getInstanceWithStages/advanceStage/cancelInstance back approveWorkOrder and
// workflowDocument.factory.js's real (unmocked) reject/cancel/reopen implementations, which
// work-order.service.js's woWorkflow wraps — these run for real in this test file, only the
// workflowEngine primitives underneath them are stubbed.
const mockIsEditable = jest.fn().mockResolvedValue(true);
const mockCanActOnCurrentStage = jest.fn().mockResolvedValue({ allowed: true });
const mockGetInstanceWithStages = jest.fn().mockResolvedValue({ instance: { currentStage: { stage_name: 'WO Approver' } } });
const mockAdvanceStage = jest.fn();
const mockCancelInstance = jest.fn();
jest.mock('../workflowEngine.service', () => ({
	isEditable: (...args) => mockIsEditable(...args),
	canActOnCurrentStage: (...args) => mockCanActOnCurrentStage(...args),
	getInstanceWithStages: (...args) => mockGetInstanceWithStages(...args),
	advanceStage: (...args) => mockAdvanceStage(...args),
	cancelInstance: (...args) => mockCancelInstance(...args),
}));

const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { UPDATE: 'UPDATE' } };

const mockWoItemFindOne = jest.fn();
// IndentItem.findOne is used both by applyIndentQtyDeltaForWorkOrder (the qty ledger under
// test) and, unavoidably, by budget-validation.service.js's own lockIndentItem (called first,
// inside createWorkOrder/updateWorkOrder/approveWorkOrder, against the same table). Resolving a
// row with no budget_id makes the budget-validation call no-op cleanly (mirrors item-wise/
// no-budget lines — see budget-validation.service.js's own no-op comment) while still giving
// applyIndentQtyDeltaForWorkOrder a real row to operate on.
const mockIndentItemFindOne = jest.fn();
const mockPaymentRequisitionDestroy = jest.fn().mockResolvedValue(undefined);
const mockWoFindOne = jest.fn();
// The model-level WorkOrderItem.findAll budget-validation.service.js's getCommittedTaxableAmount
// queries directly (distinct from workOrderItemsRepository, the repo-layer mock below) — exposed
// so a test can simulate it seeing this WO's own lines only once wo.update() has actually
// flipped its status to 'approved', the way a real DB query would.
const mockWorkOrderItemModelFindAll = jest.fn().mockResolvedValue([]);

jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
	WorkOrder: {},
	WorkOrderItem: { findAll: (...args) => mockWorkOrderItemModelFindAll(...args) },
	Indent: {},
	IndentItem: { findOne: (...args) => mockIndentItemFindOne(...args) },
	User: {},
	organization: {},
	Role: {},
	PaymentRequisition: { destroy: (...args) => mockPaymentRequisitionDestroy(...args) },
	MasterTermsCondition: {},
	MasterUnit: {},
	Department: {},
	MasterPlaceOfUse: {},
	// Referenced by budget-validation.service.js's PO-side commitment lookup — never actually
	// queried in these tests since the default IndentItem.findOne has no budget_id, but must
	// exist so the require() destructure doesn't blow up.
	PurchaseOrder: {},
	PurchaseOrderItem: { findAll: jest.fn().mockResolvedValue([]) },
}));

jest.mock('../../repository/index', () => ({
	workOrderRepository: {
		create: jest.fn(),
		findById: jest.fn(),
		// fetchWorkOrderForWorkflow (used by approveWorkOrder and, via woWorkflow's fetchById,
		// by cancelWorkOrder/rejectWorkOrder/reopenWorkOrder) reads through findOne, not findById.
		findOne: (...args) => mockWoFindOne(...args),
		update: jest.fn(),
		delete: jest.fn(),
	},
	workOrderItemsRepository: {
		create: jest.fn(),
		findOne: (...args) => mockWoItemFindOne(...args),
		update: jest.fn(),
	},
	IndentItemRepository: { increment: jest.fn() },
	// indentQtyLog.service.js (invoked internally by applyIndentQtyDeltaForWorkOrder) pulls
	// this from the same repository index — must be present or it crashes with "not a function".
	indentItemQtyLogRepository: { create: jest.fn().mockResolvedValue({}) },
	documentChargesRepository: {
		getForDocument: jest.fn().mockResolvedValue([]),
		bulkReplaceForDocument: jest.fn().mockResolvedValue([]),
	},
}));

const { sequelize } = require('../../models/index');
const {
	workOrderRepository: woRepo,
	workOrderItemsRepository: woItemRepo,
	IndentItemRepository: indentItemRepo,
} = require('../../repository/index');
const woService = require('../work-order.service');

// A service line — no stock, no physical qty ceiling by design pre-fix. Post-fix,
// qty_for_purchase_order is populated at indent approval just like a product line (see
// indent.service.js's approveIndent) and must be enforced identically here.
function baseServiceItem(overrides = {}) {
	return {
		product_id: 1,
		budget_id: null,
		productSnapshot: { name: 'Male work service', item_type: 'service' },
		budget_no: null,
		batch_id: null,
		qty: 6,
		qty_for_purchase_order: 10,
		price: 100,
		discount: 0,
		discount_price_type: 'percent',
		tax_id: null,
		igst: 0,
		cgst: 0,
		sgst: 0,
		cess: 0,
		total: 600,
		stock_type: 'service',
		note: '',
		selected_uom_id: null,
		specification: '',
		...overrides,
	};
}

function baseReq(overrides = {}) {
	return {
		user: { org_id: 1, roles: ['org_admin'] },
		body: {
			indent_id: 5,
			workOrderDetail: {},
			vendorInfo: {},
		},
		...overrides,
	};
}

// Minimal shape fetchWorkOrderForWorkflow's mocked findOne resolves to — used by
// approveWorkOrder/cancelWorkOrder, which read wo.items/wo.indent_id/wo.status directly off it.
function fetchedWorkOrder(overrides = {}) {
	return {
		id: 100,
		indent_id: 5,
		status: 'in_progress',
		items: [{ id: 1, product_id: 1, qty: 6 }],
		update: jest.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	sequelize.transaction.mockResolvedValue(mockTransaction);
	mockTransaction.commit.mockResolvedValue(undefined);
	mockTransaction.rollback.mockResolvedValue(undefined);
	// No budget_id => budget-validation.service.js's validateIndentLineBudget no-ops.
	mockIndentItemFindOne.mockResolvedValue({ id: 999, qty_for_purchase_order: 10, budget_id: null });
	mockIsEditable.mockResolvedValue(true);
	mockCanActOnCurrentStage.mockResolvedValue({ allowed: true });
	mockGetInstanceWithStages.mockResolvedValue({ instance: { currentStage: { stage_name: 'WO Approver' } } });
});

// ─── createWorkOrder ────────────────────────────────────────────────────────

describe('createWorkOrder — qty_for_purchase_order cap-check, no ledger commit at create', () => {
	it('rejects when a service item qty exceeds qty_for_purchase_order', async () => {
		const req = baseReq({
			body: { ...baseReq().body, productItems: [baseServiceItem({ qty: 15, qty_for_purchase_order: 10 })] },
		});

		await expect(woService.createWorkOrder(req)).rejects.toThrow(/should not be greater than W.O Order qty/);
		expect(woRepo.create).not.toHaveBeenCalled();
	});

	it('allows a service item within qty_for_purchase_order but does NOT touch the indent ledger (commits only at approval)', async () => {
		woRepo.create.mockResolvedValue({ id: 100 });
		woItemRepo.create.mockResolvedValue({ id: 200 });
		const req = baseReq({
			body: { ...baseReq().body, productItems: [baseServiceItem({ qty: 6, qty_for_purchase_order: 10 })] },
		});

		await woService.createWorkOrder(req);

		expect(indentItemRepo.increment).not.toHaveBeenCalled();
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	it('rejects a service item once qty_for_purchase_order is fully consumed', async () => {
		const req = baseReq({
			body: { ...baseReq().body, productItems: [baseServiceItem({ qty: 1, qty_for_purchase_order: 0 })] },
		});

		await expect(woService.createWorkOrder(req)).rejects.toThrow(/should not be greater than W.O Order qty/);
	});
});

// ─── updateWorkOrder ────────────────────────────────────────────────────────

describe('updateWorkOrder — qty_for_purchase_order cap-check, no ledger commit at update', () => {
	function existingWorkOrder(overrides = {}) {
		return { id: 100, indent_id: 5, ...overrides };
	}

	it('rejects when the updated service item qty exceeds qty_for_purchase_order', async () => {
		woRepo.findById.mockResolvedValue(existingWorkOrder());
		const req = baseReq({
			params: { id: 100 },
			body: { ...baseReq().body, productItems: [baseServiceItem({ qty: 20, qty_for_purchase_order: 10 })] },
		});

		await expect(woService.updateWorkOrder(req)).rejects.toThrow(/should not be greater than W.O Order qty/);
		expect(woRepo.update).not.toHaveBeenCalled();
	});

	it('updates the item but does NOT touch the indent ledger (isEditable already guarantees this only runs pre-approval)', async () => {
		woRepo.findById.mockResolvedValue(existingWorkOrder());
		mockWoItemFindOne.mockResolvedValue({ id: 200, qty: 6 });
		const req = baseReq({
			params: { id: 100 },
			body: { ...baseReq().body, productItems: [baseServiceItem({ qty: 8, qty_for_purchase_order: 10 })] },
		});

		await woService.updateWorkOrder(req);

		expect(indentItemRepo.increment).not.toHaveBeenCalled();
		expect(woItemRepo.update).toHaveBeenCalled();
		expect(mockTransaction.commit).toHaveBeenCalled();
	});
});

// ─── approveWorkOrder ───────────────────────────────────────────────────────

describe('approveWorkOrder — the actual qty-ledger commit point', () => {
	it('commits the qty ledger when advanceStage resolves to the terminal approved status', async () => {
		mockWoFindOne.mockResolvedValue(fetchedWorkOrder());
		mockAdvanceStage.mockResolvedValue({ status: 'approved' });

		await woService.approveWorkOrder({ user: { id: 1, name: 'A', email: 'a@x.com' } }, 100, 'looks good');

		expect(indentItemRepo.increment).toHaveBeenCalledWith(
			{ qty_for_purchase_order: -6 },
			expect.objectContaining({ where: { indent_id: 5, product_id: 1 } }),
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	it('does NOT commit the qty ledger when an intermediate stage leaves the WO not yet approved (multi-stage workflow safety)', async () => {
		mockWoFindOne.mockResolvedValue(fetchedWorkOrder());
		mockAdvanceStage.mockResolvedValue({ status: 'in_progress' });

		await woService.approveWorkOrder({ user: { id: 1, name: 'A', email: 'a@x.com' } }, 100, 'stage 1 of 2');

		expect(indentItemRepo.increment).not.toHaveBeenCalled();
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	it('does not self-count this WO\'s own lines as "already committed" against a value-wise indent budget (regression: budget check must run BEFORE the status flip to approved)', async () => {
		const wo = fetchedWorkOrder({
			status: 'in_progress',
			items: [{ id: 1, product_id: 1, qty: 6, total: 75000.01, igst: 0, cgst: 0, sgst: 0, cess: 0 }],
		});
		let statusFlipped = false;
		wo.update = jest.fn(async () => {
			statusFlipped = true;
		});
		mockWoFindOne.mockResolvedValue(wo);
		mockAdvanceStage.mockResolvedValue({ status: 'approved' });
		// Value-wise budget, indent line amount exactly equal to this WO's own requested amount —
		// approvable with nothing else committed, but would incorrectly self-block if the
		// committed-sum query ran after wo.update() already flipped this WO's own status.
		mockIndentItemFindOne.mockResolvedValue({
			id: 999,
			amount: 75000.01,
			budget_id: 5,
			indent: { budgetType: 'value-wise' },
		});
		// Simulates the real DB: this WO's own line only becomes visible to the
		// status='approved' committed-sum query once wo.update() has actually run.
		mockWorkOrderItemModelFindAll.mockImplementation(() =>
			Promise.resolve(
				statusFlipped
					? [{ product_id: 1, total: 75000.01, igst: 0, cgst: 0, sgst: 0, cess: 0 }]
					: [],
			),
		);

		await expect(
			woService.approveWorkOrder({ user: { id: 1, name: 'A', email: 'a@x.com' } }, 100, 'ok'),
		).resolves.toBeDefined();

		expect(wo.update).toHaveBeenCalled();
		expect(mockTransaction.commit).toHaveBeenCalled();
		expect(mockTransaction.rollback).not.toHaveBeenCalled();
	});
});

// ─── cancelWorkOrder ────────────────────────────────────────────────────────

describe('cancelWorkOrder — releases committed qty only if the WO had actually reached approved', () => {
	it('releases the committed qty when cancelling an already-approved WO', async () => {
		mockWoFindOne.mockResolvedValue(fetchedWorkOrder({ status: 'approved' }));
		mockCancelInstance.mockResolvedValue({ status: 'cancelled' });

		await woService.cancelWorkOrder({ user: { id: 1, name: 'A', email: 'a@x.com' } }, 100, 'no longer needed');

		expect(indentItemRepo.increment).toHaveBeenCalledWith(
			{ qty_for_purchase_order: 6 },
			expect.objectContaining({ where: { indent_id: 5, product_id: 1 } }),
		);
	});

	it('does NOT release anything when cancelling a WO that never reached approved', async () => {
		mockWoFindOne.mockResolvedValue(fetchedWorkOrder({ status: 'in_progress' }));
		mockCancelInstance.mockResolvedValue({ status: 'cancelled' });

		await woService.cancelWorkOrder({ user: { id: 1, name: 'A', email: 'a@x.com' } }, 100, 'changed mind');

		expect(indentItemRepo.increment).not.toHaveBeenCalled();
	});
});

// ─── deleteWorkOrder ────────────────────────────────────────────────────────

describe('deleteWorkOrder — releases qty_for_purchase_order only if the WO had actually committed', () => {
	it('releases each item qty back to the indent ledger when deleting an approved WO', async () => {
		woRepo.findById.mockResolvedValue({
			id: 100,
			indent_id: 5,
			status: 'approved',
			items: [{ product_id: 1, qty: 6 }],
		});
		const req = { params: { id: 100 }, user: { org_id: 1, role: 'org_admin' } };

		await woService.deleteWorkOrder(req);

		expect(indentItemRepo.increment).toHaveBeenCalledWith(
			{ qty_for_purchase_order: 6 },
			expect.objectContaining({ where: { indent_id: 5, product_id: 1 } }),
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	it('does NOT release anything when deleting a draft/in-progress WO (nothing was ever committed)', async () => {
		woRepo.findById.mockResolvedValue({
			id: 101,
			indent_id: 5,
			status: 'in_progress',
			items: [{ product_id: 1, qty: 6 }],
		});
		const req = { params: { id: 101 }, user: { org_id: 1, role: 'org_admin' } };

		await woService.deleteWorkOrder(req);

		expect(indentItemRepo.increment).not.toHaveBeenCalled();
		expect(mockTransaction.commit).toHaveBeenCalled();
	});
});
