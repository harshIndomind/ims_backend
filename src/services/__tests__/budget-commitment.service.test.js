'use strict';

const { Op } = require('sequelize');

const mockBudgetFindOne = jest.fn();
const mockChargeFindAll = jest.fn();
const mockPoFindAll = jest.fn();
const mockWoFindAll = jest.fn();
const mockPoItemFindAll = jest.fn();
const mockWoItemFindAll = jest.fn();
const mockSumApprovedShortCloseQty = jest.fn();
const mockInvoiceFindAll = jest.fn();
const mockInvoiceItemFindAll = jest.fn();
const mockInvoiceChargeFindAll = jest.fn();
const mockInvoiceChargeSum = jest.fn();
const mockPoFindOne = jest.fn();
const mockIndentItemFindAll = jest.fn();

jest.mock('../../models/index', () => ({
	Budget: { findOne: mockBudgetFindOne },
	DocumentCharge: { findAll: mockChargeFindAll },
	Indent: {},
	IndentItem: { findAll: mockIndentItemFindAll },
	PurchaseOrder: { findAll: mockPoFindAll, findOne: mockPoFindOne },
	PurchaseOrderItem: { findAll: mockPoItemFindAll },
	WorkOrder: { findAll: mockWoFindAll },
	WorkOrderItem: { findAll: mockWoItemFindAll },
	PurchaseInvoice: { findAll: mockInvoiceFindAll },
	PurchaseInvoiceItem: { findAll: mockInvoiceItemFindAll },
	PurchaseInvoiceCharge: { findAll: mockInvoiceChargeFindAll, sum: mockInvoiceChargeSum },
}));

jest.mock('../../repository/shortCloseRequestItems.repository', () => ({
	sumApprovedQtyForPoWoItem: mockSumApprovedShortCloseQty,
}));

const {
	validateBudgetCommitment,
	computeDocumentBudgetComponents,
	componentsForStoredDocument,
	validateInvoiceBudget,
	getInvoiceChargeVariance,
	getCommittedBudgetImpact,
	validateIndentAgainstLiveBudget,
	getIndentBudgetPosition,
} = require('../budget-validation.service');

const mockTransaction = { LOCK: { UPDATE: 'UPDATE' } };

// Spec example budget: base 10,00,000 + provision 50,000 = 10,50,000, GST recoverable.
function budget(overrides = {}) {
	return {
		id: 7,
		budget_id: 'BUD-000007',
		amount: 1000000,
		tax_duty_amount: 0,
		provision_amount: 50000,
		commitment_limit: 1050000,
		revised_amount: 0,
		tax_budget_impact: 'recoverable',
		...overrides,
	};
}

const requestComponents = (taxable, chargeAmount = 0, budget_id = 7) =>
	computeDocumentBudgetComponents(
		{
			items: [{ taxableAmount: taxable, taxAmount: taxable * 0.18, cess: 0 }],
			preTaxCharges: chargeAmount ? [{ name: 'Freight', amount: chargeAmount, tax: 0 }] : [],
			postTaxCharges: [],
		},
		[{ budget_id }],
	);

// A stored, committed PO line (server-computed figures) against budget 7.
function storedLine({ id = 1, taxable, budget_id = 7, qty = 1 }) {
	return { id, qty, budget_id, total: taxable * 1.18, igst: taxable * 0.18, cgst: 0, sgst: 0, cess: 0 };
}

beforeEach(() => {
	jest.clearAllMocks();
	mockBudgetFindOne.mockResolvedValue(budget());
	mockChargeFindAll.mockResolvedValue([]);
	mockPoFindAll.mockResolvedValue([]);
	mockWoFindAll.mockResolvedValue([]);
	mockPoItemFindAll.mockResolvedValue([]);
	mockWoItemFindAll.mockResolvedValue([]);
	mockSumApprovedShortCloseQty.mockResolvedValue(0);
	mockInvoiceFindAll.mockResolvedValue([]);
	mockInvoiceItemFindAll.mockResolvedValue([]);
	mockInvoiceChargeFindAll.mockResolvedValue([]);
	mockInvoiceChargeSum.mockResolvedValue(0);
	mockPoFindOne.mockResolvedValue(null);
	mockIndentItemFindAll.mockResolvedValue([]);
});

describe('validateBudgetCommitment', () => {
	it('passes a PO whose items + freight use part of the provision', async () => {
		await expect(
			validateBudgetCommitment({
				components: requestComponents(1000000, 13000),
				documentType: 'purchase_order',
				enforce: true,
				transaction: mockTransaction,
			}),
		).resolves.toEqual([]);
	});

	it('rejects (enforce) the spec case: 10,60,000 needed vs 10,50,000 limit → excess 10,000', async () => {
		await expect(
			validateBudgetCommitment({
				components: requestComponents(1000000, 60000),
				documentType: 'purchase_order',
				documentLabel: 'this Purchase Order',
				enforce: true,
				transaction: mockTransaction,
			}),
		).rejects.toThrow(/Excess: 10000\.00\./);
	});

	it('advisory mode returns the violation instead of throwing, and takes no row lock', async () => {
		const violations = await validateBudgetCommitment({
			components: requestComponents(1000000, 60000),
			documentType: 'purchase_order',
			enforce: false,
			transaction: mockTransaction,
		});
		expect(violations).toHaveLength(1);
		expect(violations[0]).toMatchObject({ budget_id: 7, commitment_limit: 1050000, requested: 1060000, excess: 10000 });
		expect(mockBudgetFindOne.mock.calls[0][0].lock).toBeUndefined();
	});

	it('locks the Budget row FOR UPDATE when enforcing', async () => {
		await validateBudgetCommitment({
			components: requestComponents(100),
			documentType: 'purchase_order',
			enforce: true,
			transaction: mockTransaction,
		});
		expect(mockBudgetFindOne.mock.calls[0][0].lock).toBe('UPDATE');
	});

	it('an approved revision raises the effective limit', async () => {
		mockBudgetFindOne.mockResolvedValue(budget({ revised_amount: 10000 }));
		await expect(
			validateBudgetCommitment({
				components: requestComponents(1000000, 60000),
				documentType: 'purchase_order',
				enforce: true,
				transaction: mockTransaction,
			}),
		).resolves.toEqual([]);
	});

	it('non-recoverable tax counts against the limit', async () => {
		mockBudgetFindOne.mockResolvedValue(budget({ tax_budget_impact: 'non_recoverable' }));
		await expect(
			validateBudgetCommitment({
				components: requestComponents(1000000),
				documentType: 'purchase_order',
				enforce: true,
				transaction: mockTransaction,
			}),
		).rejects.toThrow(/Budget Impact: 1180000\.00/);
	});

	it('sums already-committed PO + WO impact (another document already uses 9,00,000)', async () => {
		mockPoFindAll.mockResolvedValue([{ id: 50, customFields: null, same_state: false, doc_number: 'PO-50' }]);
		mockPoItemFindAll.mockResolvedValue([storedLine({ taxable: 600000 })]);
		mockWoFindAll.mockResolvedValue([{ id: 60, customFields: null, same_state: false, doc_number: 'WO-60' }]);
		mockWoItemFindAll.mockResolvedValue([storedLine({ taxable: 300000 })]);

		await expect(
			validateBudgetCommitment({
				components: requestComponents(200000),
				documentType: 'purchase_order',
				enforce: true,
				transaction: mockTransaction,
			}),
		).rejects.toThrow(/Already Committed: 900000\.00, Available: 150000\.00.*Excess: 50000\.00/);
	});

	it('only counts committed statuses and excludes the document being validated', async () => {
		await validateBudgetCommitment({
			components: requestComponents(100),
			documentType: 'purchase_order',
			excludeDocumentId: 42,
			enforce: true,
			transaction: mockTransaction,
		});
		const poWhere = mockPoFindAll.mock.calls[0][0].where;
		expect(poWhere.status[Op.notIn]).toEqual(['draft', 'cancelled', 'rejected']);
		expect(poWhere.id[Op.ne]).toBe(42);
		const woWhere = mockWoFindAll.mock.calls[0][0].where;
		expect(woWhere.status[Op.in]).toEqual(['approved', 'completed']);
		expect(woWhere.id).toBeUndefined(); // a PO's id never excludes a WO
	});

	it('committed impact is netted by approved short-close qty', async () => {
		mockPoFindAll.mockResolvedValue([{ id: 50, customFields: null, same_state: false }]);
		mockPoItemFindAll.mockResolvedValue([storedLine({ taxable: 1000000, qty: 10 })]);
		mockSumApprovedShortCloseQty.mockResolvedValue(5); // half short-closed → 5,00,000 still committed

		await expect(
			validateBudgetCommitment({
				components: requestComponents(550000),
				documentType: 'purchase_order',
				enforce: true,
				transaction: mockTransaction,
			}),
		).resolves.toEqual([]);
	});

	it('no-ops when the document touches no budget', async () => {
		await expect(
			validateBudgetCommitment({
				components: requestComponents(999999999, 0, null),
				documentType: 'purchase_order',
				enforce: true,
				transaction: mockTransaction,
			}),
		).resolves.toEqual([]);
		expect(mockBudgetFindOne).not.toHaveBeenCalled();
	});
});

describe('componentsForStoredDocument', () => {
	it('uses persisted document_charges rows, honouring budget_impact=false', async () => {
		mockChargeFindAll.mockResolvedValue([
			{ name: 'Freight', calculation_type: 'FIXED', value: '500', operation: '+', apply_on: 'AFTER_TAX', tax_treatment: 'NON_TAXABLE', budget_impact: true, taxable_amount: '500', cgst: '0', sgst: '0', igst: '0', total: '500' },
			{ name: 'Vendor-borne', calculation_type: 'FIXED', value: '300', operation: '+', apply_on: 'AFTER_TAX', tax_treatment: 'NON_TAXABLE', budget_impact: false, taxable_amount: '300', cgst: '0', sgst: '0', igst: '0', total: '300' },
		]);
		const components = await componentsForStoredDocument(
			'purchase_order',
			{ id: 1, items: [storedLine({ taxable: 1000 })] },
			{ transaction: mockTransaction },
		);
		expect(components.get(7)).toEqual({ taxable: 1000, tax: 180, chargeAmount: 500, chargeTax: 0 });
	});

	it('reconstructs legacy customFields charges when no rows exist', async () => {
		const components = await componentsForStoredDocument(
			'purchase_order',
			{
				id: 1,
				same_state: false,
				customFields: [{ name: 'Freight', amount: 250, valueType: 'rupee', operationType: '+' }],
				items: [{ ...storedLine({ taxable: 1000 }), price: 1000, discount: 0, taxSnapshot: { rate: 18 } }],
			},
			{ transaction: mockTransaction },
		);
		expect(components.get(7).chargeAmount).toBe(250);
	});
});

// Invoice 7 scenario: PO 10 = 50 × 15,000 + 18% GST (8,85,000, no charges) against BUD-000010
// (limit 9,64,000, GST non-recoverable); the invoice adds 20% post-tax freight = 1,77,000.
describe('Purchase Invoice budget layer', () => {
	const bud10 = () => budget({ id: 10, budget_id: 'BUD-000010', commitment_limit: 964000, tax_budget_impact: 'non_recoverable' });
	const poLine = { id: 11, qty: 50, budget_id: 10, total: 885000, igst: 135000, cgst: 0, sgst: 0, cess: 0 };
	const invoiceLine = { po_wo_item_id: 11, total: 885000, igst: 135000, cgst: 0, sgst: 0, cess: 0 };
	const freight = { total: 177000, igst: 0, cgst: 0, sgst: 0, cess: 0 };
	const invoice = (overrides = {}) => ({
		id: 7,
		document_type: 'purchase_order',
		purchase_order_id: 10,
		items: [invoiceLine],
		charges: [freight],
		...overrides,
	});

	beforeEach(() => {
		mockBudgetFindOne.mockResolvedValue(bud10());
		mockPoFindOne.mockResolvedValue({ id: 10, customFields: null, same_state: false });
		mockPoItemFindAll.mockImplementation(({ where }) =>
			Promise.resolve(where.id ? [{ id: 11, budget_id: 10 }] : [poLine]),
		);
	});

	it('blocks approval of an invoice whose freight pushes the PO past the limit (excess 98,000)', async () => {
		await expect(validateInvoiceBudget({ invoice: invoice(), enforce: true, transaction: mockTransaction })).rejects.toThrow(
			/Excess: 98000\.00/,
		);
		expect(mockBudgetFindOne.mock.calls[0][0].lock).toBe('UPDATE');
	});

	it('passes an invoice that only bills what the PO committed', async () => {
		await expect(
			validateInvoiceBudget({ invoice: invoice({ charges: [] }), enforce: true, transaction: mockTransaction }),
		).resolves.toEqual([]);
	});

	it('a partial invoice never double-counts against its own PO commitment', async () => {
		const half = { ...invoiceLine, total: 442500, igst: 67500 };
		await expect(
			validateInvoiceBudget({ invoice: invoice({ items: [half], charges: [] }), enforce: true, transaction: mockTransaction }),
		).resolves.toEqual([]);
	});

	it('advisory mode returns the violation without locking', async () => {
		const v = await validateInvoiceBudget({ invoice: invoice({ id: null }), enforce: false });
		expect(v[0]).toMatchObject({ budget_id: 10, excess: 98000, requested: 1062000 });
		expect(mockBudgetFindOne.mock.calls[0][0].lock).toBeUndefined();
	});

	it('an approved invoice overrun counts in later PO/WO commitment checks', async () => {
		mockPoFindAll.mockResolvedValue([{ id: 10, customFields: null, same_state: false, doc_number: 'PO-10' }]);
		mockInvoiceFindAll.mockResolvedValue([{ id: 7, document_type: 'purchase_order' }]);
		mockInvoiceItemFindAll.mockResolvedValue([invoiceLine]);
		mockInvoiceChargeFindAll.mockResolvedValue([freight]);
		const { committed, breakdown } = await getCommittedBudgetImpact({ budget: bud10(), transaction: mockTransaction });
		expect(committed).toBe(1062000);
		expect(breakdown[0]).toMatchObject({ committed: 885000, invoiced: 1062000 });
	});

	it('flags charges billed beyond what the PO carried', async () => {
		mockChargeFindAll.mockResolvedValue([]); // PO had no document_charges
		const variance = await getInvoiceChargeVariance({
			documentType: 'purchase_order',
			documentId: 10,
			newChargesTotal: 177000,
			tolerancePct: 2,
			transaction: mockTransaction,
		});
		expect(variance).toEqual({ orderCharges: 0, invoicedCharges: 177000, excess: 177000 });
	});

	it('does not flag invoice charges within 2% of the PO charges (cumulative across invoices)', async () => {
		mockChargeFindAll.mockResolvedValue([
			{ name: 'Freight', calculation_type: 'FIXED', value: '10000', operation: '+', apply_on: 'AFTER_TAX', tax_treatment: 'NON_TAXABLE', budget_impact: true, taxable_amount: '10000', cgst: '0', sgst: '0', igst: '0', total: '10000' },
		]);
		mockInvoiceChargeSum.mockResolvedValue(6000); // earlier invoice billed 6,000 of it
		await expect(
			getInvoiceChargeVariance({ documentType: 'purchase_order', documentId: 10, newChargesTotal: 4100, tolerancePct: 2, transaction: mockTransaction }),
		).resolves.toBeNull();
	});
});

// IND-000021 scenario: BUD-000010 (base 8,00,000 + tax 1,44,000 + provision 20,000 = 9,64,000,
// GST non-recoverable). IND-000020 reserves 7,50,000 and was ordered as PO 10, whose approved
// invoice 9 is 9,15,000 (incl. 30,000 transport). A rice indent of 49,995 + 18% = 58,994.10.
describe('Indent vs live budget', () => {
	const bud10 = () =>
		budget({ id: 10, budget_id: 'BUD-000010', amount: 800000, tax_duty_amount: 144000, provision_amount: 20000, commitment_limit: 964000, tax_budget_impact: 'non_recoverable' });
	const poLine = { id: 11, qty: 50, budget_id: 10, total: 885000, igst: 135000, cgst: 0, sgst: 0, cess: 0 };

	function withPo10Invoiced() {
		mockPoFindAll.mockResolvedValue([{ id: 10, customFields: null, same_state: false, doc_number: 'PO-10', indent_id: 20 }]);
		mockPoItemFindAll.mockResolvedValue([poLine]);
		mockInvoiceFindAll.mockResolvedValue([{ id: 9, document_type: 'purchase_order' }]);
		mockInvoiceItemFindAll.mockResolvedValue([{ po_wo_item_id: 11, total: 885000, igst: 135000, cgst: 0, sgst: 0, cess: 0 }]);
		mockInvoiceChargeFindAll.mockResolvedValue([{ total: 30000, igst: 0, cgst: 0, sgst: 0, cess: 0 }]);
		mockPoItemFindAll.mockImplementation(({ where }) => Promise.resolve(where.id ? [{ id: 11, budget_id: 10 }] : [poLine]));
	}

	it('blocks the rice indent with the same 9,994.10 excess the PO used to report', async () => {
		withPo10Invoiced();
		mockIndentItemFindAll.mockResolvedValue([{ indent_id: 20, amount: 750000, tax_amount: null }]);
		await expect(
			validateIndentAgainstLiveBudget({ budget: bud10(), newAmount: 49995, newTax: 8999.1, transaction: mockTransaction }),
		).resolves.toMatch(/Already Consumed \(indents\/PO\/WO\/invoices\): 915000\.00, Available: 49000\.00.*Excess: 9994\.10/);
	});

	it('passes a quantity that fits (755 kg × 55 + 18%)', async () => {
		withPo10Invoiced();
		mockIndentItemFindAll.mockResolvedValue([{ indent_id: 20, amount: 750000, tax_amount: null }]);
		await expect(
			validateIndentAgainstLiveBudget({ budget: bud10(), newAmount: 41525, newTax: 7474.5, transaction: mockTransaction }),
		).resolves.toBeNull();
	});

	it('an ordered indent counts once — at max(reserve, actual) — not reserve + actual', async () => {
		withPo10Invoiced();
		mockIndentItemFindAll.mockResolvedValue([{ indent_id: 20, amount: 750000, tax_amount: null }]);
		const pos = await getIndentBudgetPosition({ budget: bud10(), transaction: mockTransaction });
		expect(pos.consumedByOthers).toBe(915000);
		expect(pos.reservedByOthers).toBe(750000);
	});

	it('editing an indent replaces its own reserve, but its existing PO actuals still count', async () => {
		withPo10Invoiced();
		mockIndentItemFindAll.mockResolvedValue([{ indent_id: 20, amount: 750000, tax_amount: null }]);
		const pos = await getIndentBudgetPosition({ budget: bud10(), excludeIndentId: 20, transaction: mockTransaction });
		expect(pos.reservedByOthers).toBe(0);
		expect(pos.consumedByOthers).toBe(0);
		expect(pos.actualOfThisIndent).toBe(915000);
		// shrinking IND-000020 below what was already invoiced can't free budget
		await expect(
			validateIndentAgainstLiveBudget({ budget: bud10(), newAmount: 100, newTax: 0, excludeIndentId: 20, transaction: mockTransaction }),
		).resolves.toBeNull();
	});

	it('reserve constraint: indents (incl. tax) cannot exceed base + tax, never the provision', async () => {
		mockIndentItemFindAll.mockResolvedValue([{ indent_id: 20, amount: 800000, tax_amount: 140000 }]);
		await expect(
			validateIndentAgainstLiveBudget({ budget: bud10(), newAmount: 4000, newTax: 720, transaction: mockTransaction }),
		).resolves.toMatch(/Base \+ Tax: 944000\.00, Already Indented: 940000\.00.*Excess: 720\.00/);
	});

	it('recoverable tax is ignored on both sides', async () => {
		mockIndentItemFindAll.mockResolvedValue([{ indent_id: 20, amount: 790000, tax_amount: 142200 }]);
		await expect(
			validateIndentAgainstLiveBudget({
				budget: { ...bud10(), tax_budget_impact: 'recoverable', commitment_limit: 820000 },
				newAmount: 10000,
				newTax: 1800,
				transaction: mockTransaction,
			}),
		).resolves.toBeNull();
	});
});
