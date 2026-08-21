'use strict';

// short-close.service.js reuses purchase-order.service.js / work-order.service.js purely for
// their exported applyIndentQtyDelta(ForWorkOrder) helpers — mock both modules outright so
// requiring them here doesn't pull in their heavy transitive deps (PDF/S3/gRPC, see
// purchase-order.service.test.js's own comment on this) and so we can assert on exactly how
// short-close.service.js calls them.
const mockApplyIndentQtyDelta = jest.fn().mockResolvedValue(undefined);
const mockApplyIndentQtyDeltaForWorkOrder = jest.fn().mockResolvedValue(undefined);
jest.mock('../purchase-order.service', () => ({ applyIndentQtyDelta: mockApplyIndentQtyDelta }));
jest.mock('../work-order.service', () => ({ applyIndentQtyDeltaForWorkOrder: mockApplyIndentQtyDeltaForWorkOrder }));

jest.mock('../auditLog.service', () => ({ record: jest.fn().mockResolvedValue(undefined) }));

const mockWorkflowEngine = {
	startInstance: jest.fn(),
	advanceStage: jest.fn(),
	canActOnCurrentStage: jest.fn().mockResolvedValue({ allowed: true }),
	getInstanceWithStages: jest.fn().mockResolvedValue({ instance: { currentStage: { stage_name: 'Short Close Approver' } } }),
	rejectInstance: jest.fn(),
	cancelInstance: jest.fn(),
};
jest.mock('../workflowEngine.service', () => mockWorkflowEngine);

const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { UPDATE: 'UPDATE' } };

const mockShortCloseRequest = { create: jest.fn(), findOne: jest.fn() };
const mockShortCloseRequestItem = { bulkCreate: jest.fn() };
const mockPurchaseOrder = { findOne: jest.fn() };
const mockWorkOrder = { findOne: jest.fn() };

jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
	PurchaseOrder: mockPurchaseOrder,
	PurchaseOrderItem: {},
	WorkOrder: mockWorkOrder,
	WorkOrderItem: {},
	ShortCloseRequest: mockShortCloseRequest,
	ShortCloseRequestItem: mockShortCloseRequestItem,
}));

const mockSumAccepted = jest.fn();
const mockSumApprovedShortClose = jest.fn();
jest.mock('../../repository/index', () => ({
	qcInspectionItemsRepository: { sumAcceptedQtyForPoWoItem: mockSumAccepted },
	shortCloseRequestItemsRepository: { sumApprovedQtyForPoWoItem: mockSumApprovedShortClose },
}));

const { sequelize, ShortCloseRequest, ShortCloseRequestItem, PurchaseOrder, WorkOrder } = require('../../models/index');
const shortCloseService = require('../short-close.service');

function baseReq(overrides = {}) {
	return {
		user: { id: 1, org_id: 1, name: 'Requester', email: 'r@x.com' },
		...overrides,
	};
}

function poItem(overrides = {}) {
	return {
		id: 200,
		product_id: 1,
		selected_uom_id: null,
		qty: 100,
		productSnapshot: { name: 'Cement' },
		...overrides,
	};
}

beforeEach(() => {
	// resetAllMocks (not clearAllMocks) so a leftover queued mockResolvedValueOnce from one
	// test can never leak into the next — each test owns its own findOne call sequence.
	jest.resetAllMocks();
	sequelize.transaction.mockResolvedValue(mockTransaction);
	mockApplyIndentQtyDelta.mockResolvedValue(undefined);
	mockApplyIndentQtyDeltaForWorkOrder.mockResolvedValue(undefined);
	mockWorkflowEngine.getInstanceWithStages.mockResolvedValue({
		instance: { currentStage: { stage_name: 'Short Close Approver' } },
	});
});

describe('computeRemainingForItem', () => {
	it('is ordered − accepted − short-closed, floored at 0', async () => {
		mockSumAccepted.mockResolvedValue(70);
		mockSumApprovedShortClose.mockResolvedValue(10);

		const result = await shortCloseService.computeRemainingForItem(poItem({ qty: 100 }));

		expect(result).toEqual({
			ordered_qty: 100,
			accepted_qty: 70,
			previously_short_closed_qty: 10,
			remaining_qty: 20,
		});
	});

	it('never goes negative even if accepted+short-closed somehow exceeds ordered', async () => {
		mockSumAccepted.mockResolvedValue(80);
		mockSumApprovedShortClose.mockResolvedValue(30);

		const result = await shortCloseService.computeRemainingForItem(poItem({ qty: 100 }));

		expect(result.remaining_qty).toBe(0);
	});
});

describe('createShortCloseRequest', () => {
	function poWithItems(overrides = {}) {
		return {
			id: 50,
			org_id: 1,
			status: 'approved',
			indent_id: 7,
			items: [poItem()],
			...overrides,
		};
	}

	it('rejects a request already open for the same document', async () => {
		PurchaseOrder.findOne.mockResolvedValue(poWithItems());
		ShortCloseRequest.findOne.mockResolvedValue({ id: 999, status: 'in_progress' });

		await expect(
			shortCloseService.createShortCloseRequest(baseReq(), {
				document_type: 'purchase_order',
				document_id: 50,
				items: [{ po_wo_item_id: 200, short_close_qty: 10 }],
			}),
		).rejects.toThrow(/already pending approval/);

		expect(mockTransaction.commit).not.toHaveBeenCalled();
	});

	it('rejects a line whose short_close_qty exceeds the current remaining qty', async () => {
		PurchaseOrder.findOne.mockResolvedValue(poWithItems());
		ShortCloseRequest.findOne.mockResolvedValue(null);
		mockSumAccepted.mockResolvedValue(70);
		mockSumApprovedShortClose.mockResolvedValue(0);
		// remaining = 100 - 70 = 30

		await expect(
			shortCloseService.createShortCloseRequest(baseReq(), {
				document_type: 'purchase_order',
				document_id: 50,
				items: [{ po_wo_item_id: 200, short_close_qty: 35 }],
			}),
		).rejects.toThrow(/exceeds remaining qty/);
	});

	it('creates the request, starts the workflow instance, and stores its status', async () => {
		PurchaseOrder.findOne.mockResolvedValue(poWithItems());
		mockSumAccepted.mockResolvedValue(70);
		mockSumApprovedShortClose.mockResolvedValue(0);

		const created = { id: 500, update: jest.fn().mockResolvedValue(undefined) };
		ShortCloseRequest.create.mockResolvedValue(created);
		mockWorkflowEngine.startInstance.mockResolvedValue({ status: 'in_progress' });

		const finalRequest = { id: 500, status: 'in_progress', items: [] };
		// Call order: (1) open-request check, (2) generateRequestNumber's own findOne,
		// (3) fetchRequestOrThrow's final re-fetch after commit.
		ShortCloseRequest.findOne
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ id: 1, request_no: '0001' })
			.mockResolvedValueOnce(finalRequest);

		const result = await shortCloseService.createShortCloseRequest(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			reason_id: 3,
			items: [{ po_wo_item_id: 200, short_close_qty: 20 }],
		});

		expect(mockWorkflowEngine.startInstance).toHaveBeenCalledWith(
			expect.objectContaining({ documentType: 'short_close_request', documentId: 500 }),
		);
		expect(created.update).toHaveBeenCalledWith({ status: 'in_progress' }, expect.any(Object));
		expect(ShortCloseRequestItem.bulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ po_wo_item_id: 200, short_close_qty: 20, short_close_request_id: 500 })],
			expect.any(Object),
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
		expect(result).toBe(finalRequest);
	});
});

describe('approveShortCloseRequest', () => {
	function pendingRequest(overrides = {}) {
		return {
			id: 900,
			status: 'in_progress',
			document_type: 'purchase_order',
			document_id: 50,
			items: [{ po_wo_item_id: 200, short_close_qty: 20, product_id: 1 }],
			update: jest.fn().mockResolvedValue(undefined),
			...overrides,
		};
	}

	function poDoc(overrides = {}) {
		return {
			id: 50,
			status: 'approved',
			indent_id: 7,
			items: [poItem({ id: 200, qty: 100 })],
			update: jest.fn().mockResolvedValue(undefined),
			...overrides,
		};
	}

	beforeEach(() => {
		mockWorkflowEngine.canActOnCurrentStage.mockResolvedValue({ allowed: true });
		mockWorkflowEngine.advanceStage.mockResolvedValue({ status: 'approved' });
	});

	it('re-validates against current remaining qty and rejects a stale request (concurrency case)', async () => {
		// First call (outside the transaction, for assertCanAct) — status still open.
		ShortCloseRequest.findOne.mockResolvedValueOnce(pendingRequest());
		// Locked re-fetch inside the transaction — same request.
		ShortCloseRequest.findOne.mockResolvedValueOnce(pendingRequest());
		PurchaseOrder.findOne.mockResolvedValue(poDoc());

		// Someone else already consumed the remaining qty down to 5 since this request was
		// raised (e.g. a sibling short-close approved first) — requested 20 > remaining 5.
		mockSumAccepted.mockResolvedValue(70);
		mockSumApprovedShortClose.mockResolvedValue(25);

		await expect(shortCloseService.approveShortCloseRequest(baseReq(), 900)).rejects.toThrow(
			/can no longer be applied/,
		);

		expect(mockTransaction.rollback).toHaveBeenCalled();
		expect(mockApplyIndentQtyDelta).not.toHaveBeenCalled();
	});

	it('releases qty to IndentItem.qty_for_purchase_order via applyIndentQtyDelta on success (PO)', async () => {
		ShortCloseRequest.findOne.mockResolvedValueOnce(pendingRequest());
		const locked = pendingRequest();
		ShortCloseRequest.findOne.mockResolvedValueOnce(locked);
		PurchaseOrder.findOne.mockResolvedValue(poDoc());

		mockSumAccepted.mockResolvedValue(70);
		mockSumApprovedShortClose.mockResolvedValue(0); // remaining = 30, requesting 20 — OK

		// fetchRequestOrThrow after commit
		const finalRequest = { id: 900, status: 'approved' };
		ShortCloseRequest.findOne.mockResolvedValueOnce(finalRequest);

		const result = await shortCloseService.approveShortCloseRequest(baseReq(), 900);

		expect(mockApplyIndentQtyDelta).toHaveBeenCalledWith(20, 7, 1, null, mockTransaction, {
			req: baseReq(),
			source: 'short_close_released',
			sourceRefId: 900,
		});
		expect(mockApplyIndentQtyDeltaForWorkOrder).not.toHaveBeenCalled();
		expect(locked.update).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'approved' }),
			expect.any(Object),
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
		expect(result).toBe(finalRequest);
	});

	it('skips the indent release entirely when the PO has no linked indent', async () => {
		ShortCloseRequest.findOne.mockResolvedValueOnce(pendingRequest());
		ShortCloseRequest.findOne.mockResolvedValueOnce(pendingRequest());
		PurchaseOrder.findOne.mockResolvedValue(poDoc({ indent_id: null }));
		mockSumAccepted.mockResolvedValue(70);
		mockSumApprovedShortClose.mockResolvedValue(0);
		ShortCloseRequest.findOne.mockResolvedValueOnce({ id: 900, status: 'approved' });

		await shortCloseService.approveShortCloseRequest(baseReq(), 900);

		expect(mockApplyIndentQtyDelta).not.toHaveBeenCalled();
		expect(mockApplyIndentQtyDeltaForWorkOrder).not.toHaveBeenCalled();
	});

	it('uses applyIndentQtyDeltaForWorkOrder (not applyIndentQtyDelta) for a work_order request', async () => {
		const woRequest = pendingRequest({ document_type: 'work_order', document_id: 60 });
		ShortCloseRequest.findOne.mockResolvedValueOnce(woRequest);
		ShortCloseRequest.findOne.mockResolvedValueOnce(woRequest);
		WorkOrder.findOne.mockResolvedValue(
			poDoc({ id: 60, indent_id: 9 }),
		);
		mockSumAccepted.mockResolvedValue(70);
		mockSumApprovedShortClose.mockResolvedValue(0);
		ShortCloseRequest.findOne.mockResolvedValueOnce({ id: 900, status: 'approved' });

		await shortCloseService.approveShortCloseRequest(baseReq(), 900);

		expect(mockApplyIndentQtyDeltaForWorkOrder).toHaveBeenCalledWith(20, 9, 1, mockTransaction, {
			req: baseReq(),
			source: 'short_close_released',
			sourceRefId: 900,
		});
		expect(mockApplyIndentQtyDelta).not.toHaveBeenCalled();
	});

	it('completes the PO/WO once every line is fully settled (accepted + short-closed = ordered)', async () => {
		ShortCloseRequest.findOne.mockResolvedValueOnce(pendingRequest());
		ShortCloseRequest.findOne.mockResolvedValueOnce(pendingRequest());
		const doc = poDoc();
		PurchaseOrder.findOne.mockResolvedValue(doc);

		// Validation call during re-validate loop, then maybeCompleteDocument's own recompute —
		// both should see accepted 80 + this request's 20 = 100 = ordered.
		mockSumAccepted.mockResolvedValue(80);
		mockSumApprovedShortClose.mockResolvedValueOnce(0).mockResolvedValue(20);
		ShortCloseRequest.findOne.mockResolvedValueOnce({ id: 900, status: 'approved' });

		await shortCloseService.approveShortCloseRequest(baseReq(), 900);

		expect(doc.update).toHaveBeenCalledWith({ status: 'completed' }, expect.any(Object));
	});

	it('does not auto-complete a document that is not already in "approved" status', async () => {
		ShortCloseRequest.findOne.mockResolvedValueOnce(pendingRequest());
		ShortCloseRequest.findOne.mockResolvedValueOnce(pendingRequest());
		const doc = poDoc({ status: 'in_progress' });
		PurchaseOrder.findOne.mockResolvedValue(doc);
		mockSumAccepted.mockResolvedValue(80);
		mockSumApprovedShortClose.mockResolvedValueOnce(0).mockResolvedValue(20);
		ShortCloseRequest.findOne.mockResolvedValueOnce({ id: 900, status: 'approved' });

		await shortCloseService.approveShortCloseRequest(baseReq(), 900);

		expect(doc.update).not.toHaveBeenCalled();
	});
});

describe('rejectShortCloseRequest / cancelShortCloseRequest — status guards', () => {
	it('refuses to reject a request that is not open', async () => {
		ShortCloseRequest.findOne.mockResolvedValue({ id: 1, status: 'approved' });
		await expect(shortCloseService.rejectShortCloseRequest(baseReq(), 1, 'no longer needed')).rejects.toThrow(
			/Cannot reject/,
		);
	});

	it('refuses to cancel an already-approved request', async () => {
		ShortCloseRequest.findOne.mockResolvedValue({ id: 1, status: 'approved' });
		await expect(shortCloseService.cancelShortCloseRequest(baseReq(), 1, 'changed my mind')).rejects.toThrow(
			/cannot be cancelled/,
		);
	});
});
