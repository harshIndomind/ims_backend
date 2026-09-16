'use strict';

const mockIndentItemFindOne = jest.fn();
const mockPoItemFindAll = jest.fn();
const mockWoItemFindAll = jest.fn();
const mockSumApprovedShortCloseQty = jest.fn();

jest.mock('../../models/index', () => ({
	Indent: {},
	IndentItem: { findOne: mockIndentItemFindOne },
	PurchaseOrder: {},
	PurchaseOrderItem: { findAll: mockPoItemFindAll },
	WorkOrder: {},
	WorkOrderItem: { findAll: mockWoItemFindAll },
}));

jest.mock('../../repository/shortCloseRequestItems.repository', () => ({
	sumApprovedQtyForPoWoItem: mockSumApprovedShortCloseQty,
}));

const {
	validateIndentLineBudget,
	validateDocumentAgainstIndentBudget,
	taxableAmountOf,
} = require('../budget-validation.service');

const mockTransaction = { LOCK: { UPDATE: 'UPDATE' } };

function valueWiseIndentItem(overrides = {}) {
	return {
		id: 1,
		indent_id: 5,
		product_id: 10,
		uom_id: null,
		item_name: 'Cement',
		budget_id: 99,
		amount: 1000,
		indent: { id: 5, budgetType: 'value-wise' },
		...overrides,
	};
}

// A PO/WO line's stored shape: tax-inclusive `total` plus its own tax components — mirrors
// what purchase-order.service.js/work-order.service.js actually persist per line.
function poLine({ id = 1, qty, total = 118, igst = 0, cgst = 9, sgst = 9, cess = 0 } = {}) {
	return { id, qty, total, igst, cgst, sgst, cess };
}

beforeEach(() => {
	jest.clearAllMocks();
	mockPoItemFindAll.mockResolvedValue([]);
	mockWoItemFindAll.mockResolvedValue([]);
	mockSumApprovedShortCloseQty.mockResolvedValue(0);
});

describe('taxableAmountOf', () => {
	it('subtracts tax + cess from the tax-inclusive total', () => {
		expect(taxableAmountOf({ total: 118, igst: 0, cgst: 9, sgst: 9, cess: 0 })).toBe(100);
		expect(taxableAmountOf({ total: 236, igst: 18, cgst: 0, sgst: 0, cess: 18 })).toBe(200);
	});
});

describe('validateIndentLineBudget — scoping / no-ops', () => {
	it('does nothing when no matching IndentItem exists', async () => {
		mockIndentItemFindOne.mockResolvedValue(null);
		await expect(
			validateIndentLineBudget({
				indent_id: 5,
				product_id: 10,
				requestedTaxableAmount: 999999,
				transaction: mockTransaction,
			}),
		).resolves.toBeUndefined();
	});

	it('does nothing when the IndentItem carries no budget_id', async () => {
		mockIndentItemFindOne.mockResolvedValue(valueWiseIndentItem({ budget_id: null }));
		await expect(
			validateIndentLineBudget({
				indent_id: 5,
				product_id: 10,
				requestedTaxableAmount: 999999,
				transaction: mockTransaction,
			}),
		).resolves.toBeUndefined();
	});

	it('does nothing for an item-wise indent (qty_for_purchase_order governs that case instead)', async () => {
		mockIndentItemFindOne.mockResolvedValue(
			valueWiseIndentItem({ indent: { id: 5, budgetType: 'item-wise' } }),
		);
		await expect(
			validateIndentLineBudget({
				indent_id: 5,
				product_id: 10,
				requestedTaxableAmount: 999999,
				transaction: mockTransaction,
			}),
		).resolves.toBeUndefined();
	});

	it('is a no-op without a transaction (never runs unguarded/unlocked)', async () => {
		await expect(
			validateIndentLineBudget({ indent_id: 5, product_id: 10, requestedTaxableAmount: 1 }),
		).resolves.toBeUndefined();
		expect(mockIndentItemFindOne).not.toHaveBeenCalled();
	});
});

describe('validateIndentLineBudget — threshold enforcement', () => {
	it('allows a request that fits within the indent amount with nothing committed yet', async () => {
		mockIndentItemFindOne.mockResolvedValue(valueWiseIndentItem({ amount: 1000 }));
		await expect(
			validateIndentLineBudget({
				indent_id: 5,
				product_id: 10,
				requestedTaxableAmount: 1000,
				transaction: mockTransaction,
			}),
		).resolves.toBeUndefined();
	});

	it('rejects a request that exceeds the indent amount, with a clear breakdown in the message', async () => {
		mockIndentItemFindOne.mockResolvedValue(valueWiseIndentItem({ amount: 1000 }));
		await expect(
			validateIndentLineBudget({
				indent_id: 5,
				product_id: 10,
				requestedTaxableAmount: 1200,
				documentLabel: 'this Purchase Order',
				transaction: mockTransaction,
			}),
		).rejects.toThrow(
			/Indent Amount: 1000\.00, Already Committed: 0\.00, Available Amount: 1000\.00, Requested Amount \(this Purchase Order\): 1200\.00, Excess Amount: 200\.00/,
		);
	});

	it('accounts for already-committed PO amounts (taxable, not tax-inclusive) before checking the new request', async () => {
		mockIndentItemFindOne.mockResolvedValue(valueWiseIndentItem({ amount: 1000 }));
		// total=590, tax=90 → taxable=500 already committed via an earlier PO line.
		mockPoItemFindAll.mockResolvedValue([poLine({ total: 590, cgst: 45, sgst: 45 })]);

		await expect(
			validateIndentLineBudget({
				indent_id: 5,
				product_id: 10,
				requestedTaxableAmount: 500,
				transaction: mockTransaction,
			}),
		).resolves.toBeUndefined();

		await expect(
			validateIndentLineBudget({
				indent_id: 5,
				product_id: 10,
				requestedTaxableAmount: 500.01,
				transaction: mockTransaction,
			}),
		).rejects.toThrow(/Budget limit exceeded/);
	});

	it('never lets GST alone trip the check — compares taxable amounts on both sides, not tax-inclusive totals', async () => {
		// Indent amount is a pre-tax figure; a PO whose taxable value is <= it but whose
		// tax-inclusive total is higher (18% GST) must still pass.
		mockIndentItemFindOne.mockResolvedValue(valueWiseIndentItem({ amount: 1000 }));
		await expect(
			validateIndentLineBudget({
				indent_id: 5,
				product_id: 10,
				requestedTaxableAmount: 1000, // the PO's taxable amount, pre-tax
				transaction: mockTransaction,
			}),
		).resolves.toBeUndefined();
	});

	it('locks the IndentItem row via the caller transaction', async () => {
		mockIndentItemFindOne.mockResolvedValue(valueWiseIndentItem({ amount: 1000 }));
		await validateIndentLineBudget({
			indent_id: 5,
			product_id: 10,
			requestedTaxableAmount: 1,
			transaction: mockTransaction,
		});
		expect(mockIndentItemFindOne).toHaveBeenCalledWith(
			expect.objectContaining({ lock: 'UPDATE', transaction: mockTransaction }),
		);
	});
});

describe('validateIndentLineBudget — committed-amount status filtering', () => {
	it('excludes draft/cancelled/rejected PO lines from the committed sum', async () => {
		mockIndentItemFindOne.mockResolvedValue(valueWiseIndentItem({ amount: 100 }));
		// The mocked PurchaseOrderItem.findAll query itself filters by status via the `include`
		// where-clause passed to it — a plain jest.fn() doesn't apply that filter, so we assert
		// on the query shape rather than behavior the mock can't simulate.
		await validateIndentLineBudget({
			indent_id: 5,
			product_id: 10,
			requestedTaxableAmount: 1,
			transaction: mockTransaction,
		});
		const poCallArgs = mockPoItemFindAll.mock.calls[0][0];
		const poInclude = poCallArgs.include[0];
		expect(poInclude.where.status[Object.getOwnPropertySymbols(poInclude.where.status)[0]]).toEqual(
			['draft', 'cancelled', 'rejected'],
		);
	});

	it('only counts approved WO lines — a WO commits nothing until approveWorkOrder', async () => {
		mockIndentItemFindOne.mockResolvedValue(valueWiseIndentItem({ amount: 100 }));
		await validateIndentLineBudget({
			indent_id: 5,
			product_id: 10,
			requestedTaxableAmount: 1,
			transaction: mockTransaction,
		});
		const woCallArgs = mockWoItemFindAll.mock.calls[0][0];
		const woInclude = woCallArgs.include[0];
		expect(woInclude.where.status).toBe('approved');
	});

	it('excludes the document being edited from its own committed-amount sum (no double count on update)', async () => {
		mockIndentItemFindOne.mockResolvedValue(valueWiseIndentItem({ amount: 100 }));
		await validateIndentLineBudget({
			indent_id: 5,
			product_id: 10,
			requestedTaxableAmount: 1,
			excludePurchaseOrderId: 42,
			excludeWorkOrderId: 7,
			transaction: mockTransaction,
		});
		const poInclude = mockPoItemFindAll.mock.calls[0][0].include[0];
		expect(poInclude.where.id[Object.getOwnPropertySymbols(poInclude.where.id)[0]]).toBe(42);
		const woInclude = mockWoItemFindAll.mock.calls[0][0].include[0];
		expect(woInclude.where.id[Object.getOwnPropertySymbols(woInclude.where.id)[0]]).toBe(7);
	});
});

describe('validateIndentLineBudget — nets out approved short-closed qty from committed amount', () => {
	// Reproduces the reported bug: Indent amount 650 (13 units @ 50), PO1 ordered all 13
	// (taxable 650), then 3 were short-closed (released back onto IndentItem.qty_for_purchase_order
	// so a follow-up PO/WO can be raised for them). Before this fix, the committed sum ignored the
	// short-close and stayed at the full 650, so a follow-up PO for exactly the released 3 units
	// (150) was wrongly rejected as a 150 excess even though nothing was actually over-ordered.
	it('reduces a PO line\'s committed amount by its approved short-closed qty', async () => {
		mockIndentItemFindOne.mockResolvedValue(valueWiseIndentItem({ amount: 650 }));
		mockPoItemFindAll.mockResolvedValue([poLine({ id: 1, qty: 13, total: 650, cgst: 0, sgst: 0 })]);
		mockSumApprovedShortCloseQty.mockResolvedValue(3);

		// Committed nets to (650/13)*(13-3) = 500, leaving 150 available — exactly the
		// short-closed qty's own value, so the follow-up PO for it must now pass.
		await expect(
			validateIndentLineBudget({
				indent_id: 5,
				product_id: 10,
				requestedTaxableAmount: 150,
				transaction: mockTransaction,
			}),
		).resolves.toBeUndefined();
		expect(mockSumApprovedShortCloseQty).toHaveBeenCalledWith(1, { transaction: mockTransaction });

		await expect(
			validateIndentLineBudget({
				indent_id: 5,
				product_id: 10,
				requestedTaxableAmount: 150.01,
				transaction: mockTransaction,
			}),
		).rejects.toThrow(/Budget limit exceeded/);
	});

	it('does not look up short-close qty for a line with no qty on it', async () => {
		mockIndentItemFindOne.mockResolvedValue(valueWiseIndentItem({ amount: 1000 }));
		mockPoItemFindAll.mockResolvedValue([poLine({ id: 1, qty: undefined, total: 118 })]);

		await validateIndentLineBudget({
			indent_id: 5,
			product_id: 10,
			requestedTaxableAmount: 1,
			transaction: mockTransaction,
		});
		expect(mockSumApprovedShortCloseQty).not.toHaveBeenCalled();
	});
});

describe('validateDocumentAgainstIndentBudget', () => {
	it('groups multiple lines for the same product/UOM before checking, instead of validating each line alone', async () => {
		mockIndentItemFindOne.mockResolvedValue(valueWiseIndentItem({ amount: 100 }));
		// Two lines of 60 each individually fit under 100, but together (120) must not.
		await expect(
			validateDocumentAgainstIndentBudget({
				indent_id: 5,
				lines: [
					{ product_id: 10, uom_id: null, taxableAmount: 60 },
					{ product_id: 10, uom_id: null, taxableAmount: 60 },
				],
				matchUom: true,
				transaction: mockTransaction,
			}),
		).rejects.toThrow(/Excess Amount: 20\.00/);
	});

	it('checks each distinct product independently', async () => {
		mockIndentItemFindOne.mockImplementation(({ where }) =>
			Promise.resolve(
				valueWiseIndentItem({ product_id: where.product_id, amount: where.product_id === 10 ? 100 : 5 }),
			),
		);
		await expect(
			validateDocumentAgainstIndentBudget({
				indent_id: 5,
				lines: [
					{ product_id: 10, uom_id: null, taxableAmount: 90 },
					{ product_id: 20, uom_id: null, taxableAmount: 90 },
				],
				matchUom: true,
				transaction: mockTransaction,
			}),
		).rejects.toThrow(/Excess Amount: 85\.00/);
	});
});
