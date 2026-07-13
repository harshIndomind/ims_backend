'use strict';

// Isolate verifyIndent/approveIndent from the rest of the app: the workflow engine, audit
// log, and Sequelize model graph are all real infrastructure this module depends on, but
// none of it is what's under test here — only the qty_in_stock / balance_indent_qty writes
// that happen alongside the existing qty_for_purchase_order / qty_issued persistence.
const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
	Indent: {},
	Budget: {},
	IndentSerialItem: {},
	IndentItem: {},
	MasterUnit: {},
}));

jest.mock('../../repository/index', () => ({
	IndentRepository: { findById: jest.fn() },
	IndentItemRepository: {},
	IndentSerialRepository: { update: jest.fn() },
}));

jest.mock('undici', () => ({ fetch: jest.fn() }));

jest.mock('../workflowEngine.service', () => ({
	getInstanceWithStages: jest.fn().mockResolvedValue({ instance: { currentStage: { stage_name: 'verify' } } }),
	advanceStage: jest.fn().mockResolvedValue({ status: 'in_progress' }),
}));

jest.mock('../auditLog.service', () => ({
	record: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../workflowDocument.factory', () => ({
	createWorkflowDocumentService: jest.fn(() => ({
		assertCanAct: jest.fn().mockResolvedValue(true),
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
