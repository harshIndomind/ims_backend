'use strict';

// Isolate verifyIndent/approveIndent from the rest of the app: the workflow engine, audit
// log, and Sequelize model graph are all real infrastructure this module depends on, but
// none of it is what's under test here — only the qty_in_stock / balance_indent_qty writes
// that happen alongside the existing qty_for_purchase_order / qty_issued persistence.
// LOCK.UPDATE mirrors a real Sequelize transaction — the budget-phase check
// (validateBudgetPhaseOnCreate/validateIndentBudgetAmount) row-locks the Budget it reads.
const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { UPDATE: 'UPDATE' } };
const mockBudgetFindOne = jest.fn();
const mockIndentItemFindAll = jest.fn();
// attachPendingReissueForServiceItems (called from within fetchIndentForWorkflowAction, the
// shared fetcher behind approveIndent/reissuePendingQuantity/previewReissue/etc.) needs
// WorkOrderItem present — default to no WOs found, which is the correct/harmless case for
// every existing test here (none of them have raised a WO yet at the point they run).
const mockWorkOrderItemFindAll = jest.fn().mockResolvedValue([]);
jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
	Indent: {},
	Budget: { findOne: mockBudgetFindOne },
	IndentSerialItem: {},
	IndentItem: { findAll: mockIndentItemFindAll, destroy: jest.fn() },
	MasterUnit: {},
	WorkOrder: {},
	WorkOrderItem: { findAll: (...args) => mockWorkOrderItemFindAll(...args) },
}));

jest.mock('../../repository/index', () => ({
	IndentRepository: { findById: jest.fn(), create: jest.fn(), updateById: jest.fn() },
	IndentItemRepository: { create: jest.fn() },
	IndentSerialRepository: { update: jest.fn(), create: jest.fn() },
	purchaseInvoiceItemsRepository: { sumInvoicedQtyForPoWoItems: jest.fn().mockResolvedValue(new Map()) },
}));

jest.mock('undici', () => ({ fetch: jest.fn() }));

jest.mock('../workflowEngine.service', () => ({
	getInstanceWithStages: jest.fn().mockResolvedValue({ instance: { status: 'in_progress', currentStage: { stage_name: 'verify' } } }),
	advanceStage: jest.fn().mockResolvedValue({ status: 'in_progress' }),
	isEditable: jest.fn().mockResolvedValue(true),
	restartInstance: jest.fn().mockResolvedValue({ status: 'in_progress' }),
	startInstance: jest.fn().mockResolvedValue({ status: 'in_progress' }),
}));

jest.mock('../auditLog.service', () => ({
	record: jest.fn().mockResolvedValue(undefined),
	recordChange: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../workflowDocument.factory', () => ({
	createWorkflowDocumentService: jest.fn(({ fetchById }) => ({
		assertCanAct: jest.fn().mockResolvedValue(true),
		// Wired to the real fetchById (fetchIndentForWorkflowAction) so getIndentById tests can
		// exercise it for real, instead of the fixed stub every other test here relies on.
		getById: (req, id) => fetchById(id),
	})),
}));

const { sequelize } = require('../../models/index');
const { IndentRepository: indentRepo } = require('../../repository/index');
const { fetch } = require('undici');
const workflowEngine = require('../workflowEngine.service');
const indentService = require('../indent.service');

function makeIndentItem(overrides = {}) {
	const state = {
		product_id: 1,
		item_name: 'Widget',
		qty: 10,
		stock_type: 'normal',
		...overrides,
	};
	const item = {
		...state,
		get: () => ({ ...state }),
		update: jest.fn(async (data) => {
			Object.assign(state, data);
			Object.assign(item, data);
		}),
	};
	return item;
}

function vcpJsonResponse(allocationResults) {
	return { ok: true, status: 200, json: async () => ({ allocationResults }) };
}

beforeEach(() => {
	jest.clearAllMocks();
	sequelize.transaction.mockResolvedValue(mockTransaction);
	workflowEngine.getInstanceWithStages.mockResolvedValue({ instance: { currentStage: { stage_name: 'verify' } } });
	workflowEngine.advanceStage.mockResolvedValue({ status: 'in_progress' });
});

describe('updateIndent — value-wise budget re-validation', () => {
	const { IndentRepository: indentRepo2, IndentItemRepository: indentItemRepo } = require('../../repository/index');
	const { IndentItem } = require('../../models/index');

	function setupIndent(overrides = {}) {
		const state = {
			id: 1,
			indent_date: new Date('2026-01-10'),
			budgetType: 'value-wise',
			...overrides,
		};
		return {
			...state,
			get: () => ({ ...state }),
			IndentItems: [],
			IndentDocuments: [],
		};
	}

	beforeEach(() => {
		// Budget with no phase dates configured at all falls through getPhaseQuantityDateWise's
		// phase loop with nothing matching — so phase 300 (a single implicit "always open" phase)
		// is simulated by giving first_phase_date/first_phase_qty only, the simplest shape that
		// exercises the check without needing all three phases.
		mockBudgetFindOne.mockResolvedValue({
			id: 99,
			budget_id: 'BUD-1',
			amount: 1000,
			first_phase_date: new Date('2099-01-01'),
			first_phase_qty: 1000,
		});
		mockIndentItemFindAll.mockResolvedValue([]); // no other indents consuming this budget yet
		indentRepo2.findById.mockResolvedValue(setupIndent());
		IndentItem.destroy.mockResolvedValue(1);
	});

	it('rejects an edit that alone exceeds the budget phase amount', async () => {
		const req = { user: { id: 1 } };
		await expect(
			indentService.updateIndent(req, 1, {
				budgetType: 'value-wise',
				selectedIndents: [{ budget_id: 99, product_id: 1, qty: 1, total: 1500 }],
			}),
		).rejects.toThrow(/exceeds phase limit/);

		// Nothing should have been written once validation fails.
		expect(indentItemRepo.create).not.toHaveBeenCalled();
	});

	it('allows an edit that fits, and excludes this indent’s own pre-edit rows from "already consumed"', async () => {
		// A different indent (id 2) already consumed 400 against the same budget — must count.
		mockIndentItemFindAll.mockResolvedValue([{ amount: 400, qty: 1 }]);

		const req = { user: { id: 1 } };
		await indentService.updateIndent(req, 1, {
			budgetType: 'value-wise',
			selectedIndents: [{ budget_id: 99, product_id: 1, qty: 1, total: 600 }],
		});

		// 400 (other indent) + 600 (this edit) = 1000, exactly the phase limit — must pass.
		expect(indentItemRepo.create).toHaveBeenCalledTimes(1);
		expect(mockTransaction.commit).toHaveBeenCalled();

		// The exclude-self filter must have been applied to the "previously consumed" query.
		const findAllArgs = mockIndentItemFindAll.mock.calls[0][0];
		expect(findAllArgs.where.indent_id[Object.getOwnPropertySymbols(findAllArgs.where.indent_id)[0]]).toBe(1);
	});

	it('does not count rejected/cancelled indents as consuming the budget', async () => {
		const { Op } = require('sequelize');
		const req = { user: { id: 1 } };
		await indentService.updateIndent(req, 1, {
			budgetType: 'value-wise',
			selectedIndents: [{ budget_id: 99, product_id: 1, qty: 1, total: 100 }],
		});
		for (const [args] of mockIndentItemFindAll.mock.calls) {
			expect(args.include[0].where.status[Op.notIn]).toEqual(['rejected', 'cancelled']);
		}
	});

	it('still enforces the whole-budget base amount when the indent date is after the last phase', async () => {
		// Previously getPhaseQuantityDateWise returned null here and every check was skipped.
		mockBudgetFindOne.mockResolvedValue({
			id: 99,
			budget_id: 'BUD-1',
			amount: 1000,
			first_phase_date: new Date('2025-12-31'),
			first_phase_qty: 1000,
		});
		const req = { user: { id: 1 } };
		await expect(
			indentService.updateIndent(req, 1, {
				budgetType: 'value-wise',
				selectedIndents: [{ budget_id: 99, product_id: 1, qty: 1, total: 1500 }],
			}),
		).rejects.toThrow(/exceeds base budget amount of 1000/);
		expect(indentItemRepo.create).not.toHaveBeenCalled();
	});
});

describe('verifyIndent — qty_in_stock snapshot', () => {
	it('persists qty_in_stock from the dry-run total_available_quantity, leaves balance_indent_qty untouched', async () => {
		const item = makeIndentItem({ product_id: 1, qty: 10 });
		const indent = {
			id: 1,
			IndentItems: [item],
			update: jest.fn().mockResolvedValue(undefined),
		};
		indentRepo.findById.mockResolvedValue(indent);

		fetch.mockResolvedValueOnce(
			vcpJsonResponse([
				{ product_id: 1, issued_qty: 4, qty_for_purchase_order: 6, total_available_quantity: 4, minimum_stock_quantity: 0, checkMinimumStock: false },
			]),
		);

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1 } };
		await indentService.verifyIndent(req, 1, [{ product_id: 1, issue_qty: 4 }]);

		expect(item.update).toHaveBeenCalledWith(
			expect.objectContaining({ qty_for_purchase_order: 6, qty_in_stock: 4 }),
			expect.anything(),
		);
		const writtenData = item.update.mock.calls[0][0];
		expect(writtenData).not.toHaveProperty('balance_indent_qty');
	});
});

describe('approveIndent — qty_in_stock + balance_indent_qty initialization', () => {
	function setupApprove(item, { dryRun, allocation }) {
		const indent = {
			id: 1,
			IndentItems: [item],
			update: jest.fn().mockResolvedValue(undefined),
		};
		indentRepo.findById.mockResolvedValue(indent);
		// Phase 1: dry-run re-validation. Phase 2: real allocation.
		fetch.mockResolvedValueOnce(vcpJsonResponse([dryRun])).mockResolvedValueOnce(vcpJsonResponse([allocation]));
		return indent;
	}

	it('full stock: balance_indent_qty initializes to 0 (no backorder)', async () => {
		const item = makeIndentItem({ product_id: 1, qty: 10 });
		setupApprove(item, {
			dryRun: { product_id: 1, issued_qty: 10, qty_for_purchase_order: 0, total_available_quantity: 10, minimum_stock_quantity: 0, checkMinimumStock: false },
			allocation: { product_id: 1, issued_qty: 10, qty_for_purchase_order: 0, issuedSerials: [] },
		});

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1, name: 'A', email: 'a@x.com' } };
		await indentService.approveIndent(req, 1, [{ product_id: 1, issue_qty: 10 }]);

		expect(item.update).toHaveBeenCalledWith(
			expect.objectContaining({ qty_issued: 10, qty_for_purchase_order: 0, qty_in_stock: 10, balance_indent_qty: 0 }),
			expect.anything(),
		);
	});

	it('partial stock: approver issues all available — balance_indent_qty = original qty minus issued', async () => {
		const item = makeIndentItem({ product_id: 1, qty: 10 });
		setupApprove(item, {
			dryRun: { product_id: 1, issued_qty: 4, qty_for_purchase_order: 6, total_available_quantity: 4, minimum_stock_quantity: 0, checkMinimumStock: false },
			allocation: { product_id: 1, issued_qty: 4, qty_for_purchase_order: 6, issuedSerials: [] },
		});

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1, name: 'A', email: 'a@x.com' } };
		await indentService.approveIndent(req, 1, [{ product_id: 1, issue_qty: 4 }]);

		expect(item.update).toHaveBeenCalledWith(
			expect.objectContaining({ qty_issued: 4, qty_for_purchase_order: 6, qty_in_stock: 4, balance_indent_qty: 6 }),
			expect.anything(),
		);
	});

	it('partial stock: approver issues less than available — balance_indent_qty reflects actual shortfall', async () => {
		// Indent: 200 qty. VCP has 100 in stock. Approver issues only 50 (not the full 100 available).
		// balance_indent_qty must be 200 - 50 = 150, not the dry-run's qty_for_purchase_order (100).
		const item = makeIndentItem({ product_id: 1, qty: 200 });
		setupApprove(item, {
			dryRun: { product_id: 1, issued_qty: 100, qty_for_purchase_order: 100, total_available_quantity: 100, minimum_stock_quantity: 0, checkMinimumStock: false },
			allocation: { product_id: 1, issued_qty: 50, qty_for_purchase_order: 150, issuedSerials: [] },
		});

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1, name: 'A', email: 'a@x.com' } };
		await indentService.approveIndent(req, 1, [{ product_id: 1, issue_qty: 50 }]);

		expect(item.update).toHaveBeenCalledWith(
			expect.objectContaining({ qty_issued: 50, qty_for_purchase_order: 150, qty_in_stock: 100, balance_indent_qty: 150 }),
			expect.anything(),
		);
	});

	it('no stock: balance_indent_qty initializes to the full requested qty', async () => {
		const item = makeIndentItem({ product_id: 1, qty: 10 });
		setupApprove(item, {
			dryRun: { product_id: 1, issued_qty: 0, qty_for_purchase_order: 10, total_available_quantity: 0, minimum_stock_quantity: 0, checkMinimumStock: false },
			allocation: { product_id: 1, issued_qty: 0, qty_for_purchase_order: 10, issuedSerials: [] },
		});

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1, name: 'A', email: 'a@x.com' } };
		await indentService.approveIndent(req, 1, [{ product_id: 1, issue_qty: 0 }]);

		expect(item.update).toHaveBeenCalledWith(
			expect.objectContaining({ qty_issued: 0, qty_for_purchase_order: 10, qty_in_stock: 0, balance_indent_qty: 10 }),
			expect.anything(),
		);
	});

	it('service item, fully approved: qty_for_purchase_order = full approved qty, balance_indent_qty stays 0', async () => {
		// Services never carry stock, so VCP always reports them as fully issued (backorder 0) —
		// qty_for_purchase_order must still open up to the approved qty so a Work Order can be
		// raised against it. balance_indent_qty is GRN/stock-return-specific (Reissue Pending
		// Quantity) and has no equivalent for labor, so it must stay 0 regardless.
		const item = makeIndentItem({ product_id: 1, qty: 10, item_type: 'service' });
		setupApprove(item, {
			dryRun: { product_id: 1, issued_qty: 10, qty_for_purchase_order: 0, total_available_quantity: null, minimum_stock_quantity: 0, checkMinimumStock: false },
			allocation: { product_id: 1, issued_qty: 10, qty_for_purchase_order: 0, issuedSerials: [] },
		});

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1, name: 'A', email: 'a@x.com' } };
		await indentService.approveIndent(req, 1, [{ product_id: 1, issue_qty: 10 }]);

		expect(item.update).toHaveBeenCalledWith(
			expect.objectContaining({ qty_issued: 10, qty_for_purchase_order: 10, balance_indent_qty: 0 }),
			expect.anything(),
		);
	});

	it('service item, partially approved: qty_for_purchase_order tracks the approver-confirmed qty, not the original request', async () => {
		// Indent asks for 10 workers; approver only confirms 6 (e.g. contractor availability at
		// approval time) — the WO ceiling should open up to 6, not the original 10.
		const item = makeIndentItem({ product_id: 1, qty: 10, item_type: 'service' });
		setupApprove(item, {
			dryRun: { product_id: 1, issued_qty: 10, qty_for_purchase_order: 0, total_available_quantity: null, minimum_stock_quantity: 0, checkMinimumStock: false },
			allocation: { product_id: 1, issued_qty: 6, qty_for_purchase_order: 0, issuedSerials: [] },
		});

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1, name: 'A', email: 'a@x.com' } };
		await indentService.approveIndent(req, 1, [{ product_id: 1, issue_qty: 6 }]);

		expect(item.update).toHaveBeenCalledWith(
			expect.objectContaining({ qty_issued: 6, qty_for_purchase_order: 6, balance_indent_qty: 0 }),
			expect.anything(),
		);
	});
});

describe('getIndentById — actual_delivered_qty / pending_reissue_qty for service items', () => {
	const { purchaseInvoiceItemsRepository } = require('../../repository/index');

	it('computes actual_delivered_qty from invoiced-so-far and pending_reissue_qty as the requested-qty shortfall, without touching the real columns', async () => {
		// Asked for 10; VCP always reports services as fully issued at approval (qty_issued=10,
		// matching this codebase's real behavior), but only 4 has actually been invoiced so far.
		const item = makeIndentItem({
			id: 42,
			indent_id: 7,
			product_id: 1,
			item_type: 'service',
			qty: 10,
			qty_issued: 10,
			qty_updated_by_verifier: 10,
			balance_indent_qty: 0,
		});
		const indent = { id: 7, IndentItems: [item] };
		indentRepo.findById.mockResolvedValue(indent);

		mockWorkOrderItemFindAll.mockResolvedValueOnce([
			{ id: 200, product_id: 1, workOrder: { indent_id: 7 } },
		]);
		purchaseInvoiceItemsRepository.sumInvoicedQtyForPoWoItems.mockResolvedValueOnce(
			new Map([[200, 4]]),
		);

		const result = await indentService.getIndentById({}, 7);

		expect(result.IndentItems[0].actual_delivered_qty).toBe(4);
		expect(result.IndentItems[0].pending_reissue_qty).toBe(6);
		// The real stored columns must be untouched — approveIndent/reissuePendingQuantity/etc.
		// still read these for real and must never see the display override.
		expect(result.IndentItems[0].qty_issued).toBe(10);
		expect(result.IndentItems[0].qty_updated_by_verifier).toBe(10);
		expect(result.IndentItems[0].balance_indent_qty).toBe(0);
	});

	it('treats a service line with no Work Order raised yet as nothing delivered, fully pending', async () => {
		const item = makeIndentItem({
			id: 43,
			indent_id: 8,
			product_id: 2,
			item_type: 'service',
			qty: 5,
			qty_issued: 5,
			balance_indent_qty: 0,
		});
		indentRepo.findById.mockResolvedValue({ id: 8, IndentItems: [item] });
		mockWorkOrderItemFindAll.mockResolvedValueOnce([]);

		const result = await indentService.getIndentById({}, 8);

		expect(result.IndentItems[0].actual_delivered_qty).toBe(0);
		expect(result.IndentItems[0].pending_reissue_qty).toBe(5);
	});

	it('leaves product items untouched (no actual_delivered_qty/pending_reissue_qty fields added)', async () => {
		const item = makeIndentItem({ id: 44, indent_id: 9, product_id: 3, item_type: 'product', qty_issued: 8 });
		indentRepo.findById.mockResolvedValue({ id: 9, IndentItems: [item] });

		const result = await indentService.getIndentById({}, 9);

		expect(result.IndentItems[0].actual_delivered_qty).toBeUndefined();
		expect(result.IndentItems[0].pending_reissue_qty).toBeUndefined();
		expect(mockWorkOrderItemFindAll).not.toHaveBeenCalled();
	});
});

describe('reissuePendingQuantity', () => {
	function approvedIndent(item) {
		return {
			id: 1,
			status: 'approved',
			IndentItems: [item],
			update: jest.fn().mockResolvedValue(undefined),
		};
	}

	it('is a no-op when nothing has a positive balance_indent_qty', async () => {
		const item = makeIndentItem({ product_id: 1, qty_issued: 4, balance_indent_qty: 0 });
		indentRepo.findById.mockResolvedValue(approvedIndent(item));

		const result = await indentService.reissuePendingQuantity({ cookies: {}, user: {} }, 1);

		expect(result).toEqual({ indent_id: 1, reissued: [] });
		expect(fetch).not.toHaveBeenCalled();
		expect(item.update).not.toHaveBeenCalled();
	});

	it('rejects when the indent is not approved', async () => {
		const item = makeIndentItem({ product_id: 1, balance_indent_qty: 6 });
		indentRepo.findById.mockResolvedValue({ id: 1, status: 'in_progress', IndentItems: [item] });

		await expect(indentService.reissuePendingQuantity({ cookies: {}, user: {} }, 1)).rejects.toThrow(/not approved/);
	});

	it('full re-issue: VCP now has the entire balance available — balance_indent_qty drops to 0', async () => {
		const item = makeIndentItem({ product_id: 1, qty_issued: 4, balance_indent_qty: 6 });
		indentRepo.findById.mockResolvedValue(approvedIndent(item));
		fetch.mockResolvedValueOnce(vcpJsonResponse([{ product_id: 1, issued_qty: 6, issuedSerials: [] }]));

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1 } };
		const result = await indentService.reissuePendingQuantity(req, 1);

		expect(item.update).toHaveBeenCalledWith(
			expect.objectContaining({ qty_issued: 10, balance_indent_qty: 0 }),
			expect.anything(),
		);
		expect(result.reissued).toEqual([{ product_id: 1, issued_qty: 6, balance_indent_qty: 0 }]);
	});

	it('partial re-issue: only some of the balance is available yet — remainder stays pending', async () => {
		const item = makeIndentItem({ product_id: 1, qty_issued: 4, balance_indent_qty: 6 });
		indentRepo.findById.mockResolvedValue(approvedIndent(item));
		fetch.mockResolvedValueOnce(vcpJsonResponse([{ product_id: 1, issued_qty: 2, issuedSerials: [] }]));

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1 } };
		const result = await indentService.reissuePendingQuantity(req, 1);

		expect(item.update).toHaveBeenCalledWith(
			expect.objectContaining({ qty_issued: 6, balance_indent_qty: 4 }),
			expect.anything(),
		);
		expect(result.reissued).toEqual([{ product_id: 1, issued_qty: 2, balance_indent_qty: 4 }]);
	});

	it('still no stock: nothing issued, balance_indent_qty untouched, no error', async () => {
		const item = makeIndentItem({ product_id: 1, qty_issued: 4, balance_indent_qty: 6 });
		indentRepo.findById.mockResolvedValue(approvedIndent(item));
		fetch.mockResolvedValueOnce(vcpJsonResponse([{ product_id: 1, issued_qty: 0, issuedSerials: [] }]));

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1 } };
		const result = await indentService.reissuePendingQuantity(req, 1);

		expect(item.update).not.toHaveBeenCalled();
		expect(result.reissued).toEqual([]);
	});

	it('requests exactly the remaining balance_indent_qty from VCP, not the original requested qty', async () => {
		const item = makeIndentItem({ product_id: 1, qty: 10, qty_issued: 4, balance_indent_qty: 6 });
		indentRepo.findById.mockResolvedValue(approvedIndent(item));
		fetch.mockResolvedValueOnce(vcpJsonResponse([{ product_id: 1, issued_qty: 6, issuedSerials: [] }]));

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1 } };
		await indentService.reissuePendingQuantity(req, 1);

		const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
		expect(sentBody.indents[0].qty).toBe(6);
		expect(sentBody.allocateQuantity).toBe(true);
	});

	it('only sends VCP the not-yet-issued serials for a serial-type pending item', async () => {
		const item = makeIndentItem({
			product_id: 1,
			stock_type: 'serial',
			qty_issued: 5,
			balance_indent_qty: 1,
			serial_items: [
				{ serial_no: 'A', is_issued: 1 },
				{ serial_no: 'B', is_issued: 1 },
				{ serial_no: 'C', is_issued: 0 },
			],
		});
		indentRepo.findById.mockResolvedValue(approvedIndent(item));
		fetch.mockResolvedValueOnce(vcpJsonResponse([{ product_id: 1, issued_qty: 1, issuedSerials: ['C'] }]));

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1 } };
		await indentService.reissuePendingQuantity(req, 1);

		const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
		expect(sentBody.indents[0].serial_items).toEqual([{ serial_no: 'C', is_issued: 0 }]);
	});

	it('batch items: re-resolves to whichever batch currently has stock, not the one pinned at indent creation', async () => {
		// batch_id 55 was the FEFO suggestion at indent-creation time and is now empty (that's
		// why this item backordered); batch 99 was received later and has stock — verify-stock
		// only ever checks the batch_id it's handed, so re-issue must swap to 99 itself.
		const item = makeIndentItem({
			product_id: 1,
			stock_type: 'batch',
			batch_id: 55,
			qty_issued: 0,
			balance_indent_qty: 6,
		});
		indentRepo.findById.mockResolvedValue(approvedIndent(item));

		fetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({
				data: {
					batches: [
						{ id: 55, qty: '0', expiry_date: '2026-01-01' },
						{ id: 99, qty: '10', expiry_date: '2026-06-01' },
					],
				},
			}),
		});
		fetch.mockResolvedValueOnce(vcpJsonResponse([{ product_id: 1, issued_qty: 6, batch_id: 99, issuedSerials: [] }]));

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1 } };
		const result = await indentService.reissuePendingQuantity(req, 1);

		const sentBody = JSON.parse(fetch.mock.calls[1][1].body);
		expect(sentBody.indents[0].batch_id).toBe(99);

		expect(item.update).toHaveBeenCalledWith(
			expect.objectContaining({ balance_indent_qty: 0, batch_id: 99 }),
			expect.anything(),
		);
		expect(result.reissued).toEqual([{ product_id: 1, issued_qty: 6, balance_indent_qty: 0 }]);
	});
});

describe('previewReissue', () => {
	function approvedIndent(item) {
		return {
			id: 1,
			status: 'approved',
			IndentItems: [item],
			update: jest.fn().mockResolvedValue(undefined),
		};
	}

	it('is a no-op when nothing has a positive balance_indent_qty', async () => {
		const item = makeIndentItem({ product_id: 1, qty_issued: 4, balance_indent_qty: 0 });
		indentRepo.findById.mockResolvedValue(approvedIndent(item));

		const result = await indentService.previewReissue({ cookies: {}, user: {} }, 1);

		expect(result).toEqual({ indent_id: 1, items: [] });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('rejects when the indent is not approved', async () => {
		const item = makeIndentItem({ product_id: 1, balance_indent_qty: 6 });
		indentRepo.findById.mockResolvedValue({ id: 1, status: 'in_progress', IndentItems: [item] });

		await expect(indentService.previewReissue({ cookies: {}, user: {} }, 1)).rejects.toThrow(/not approved/);
	});

	it('dry-runs only — does not mutate stock or persist anything, reports availability', async () => {
		const item = makeIndentItem({ product_id: 1, item_name: 'Widget', qty_issued: 4, balance_indent_qty: 6 });
		indentRepo.findById.mockResolvedValue(approvedIndent(item));
		fetch.mockResolvedValueOnce(
			vcpJsonResponse([{ product_id: 1, issued_qty: 2, qty_for_purchase_order: 4, issuedSerials: [] }]),
		);

		const req = { cookies: { accessToken: 'tok' }, user: { id: 1 } };
		const result = await indentService.previewReissue(req, 1);

		const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
		expect(sentBody.allocateQuantity).toBe(false);
		expect(item.update).not.toHaveBeenCalled();
		expect(result).toEqual({
			indent_id: 1,
			items: [{ product_id: 1, item_name: 'Widget', pending_qty: 6, available_now: 2, still_short: 4 }],
		});
	});
});
