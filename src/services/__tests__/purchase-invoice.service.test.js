'use strict';

jest.mock('../auditLog.service', () => ({ record: jest.fn().mockResolvedValue(undefined) }));

const mockWorkflowEngine = {
	startInstance: jest.fn(),
	advanceStage: jest.fn(),
	canActOnCurrentStage: jest.fn().mockResolvedValue({ allowed: true }),
	getInstanceWithStages: jest.fn().mockResolvedValue({ instance: { currentStage: { stage_name: 'Purchase Invoice Approver' } } }),
	rejectInstance: jest.fn(),
	cancelInstance: jest.fn(),
};
jest.mock('../workflowEngine.service', () => mockWorkflowEngine);

const mockGetReceivedQtyForPoItem = jest.fn();
jest.mock('../grn.service', () => ({ getReceivedQtyForPoItem: (...args) => mockGetReceivedQtyForPoItem(...args) }));

const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { UPDATE: 'UPDATE' } };

const mockPurchaseOrderFindOne = jest.fn();
const mockPurchaseOrderItemFindAll = jest.fn();
const mockWorkOrderFindOne = jest.fn();
const mockWorkOrderItemFindAll = jest.fn();
const mockPurchaseInvoiceCreate = jest.fn();
const mockPurchaseInvoiceFindOne = jest.fn();
const mockPurchaseInvoiceItemBulkCreate = jest.fn().mockResolvedValue([]);
const mockPurchaseInvoiceChargeBulkCreate = jest.fn().mockResolvedValue([]);

jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
	PurchaseOrder: { findOne: (...args) => mockPurchaseOrderFindOne(...args) },
	PurchaseOrderItem: { findAll: (...args) => mockPurchaseOrderItemFindAll(...args) },
	WorkOrder: { findOne: (...args) => mockWorkOrderFindOne(...args) },
	WorkOrderItem: { findAll: (...args) => mockWorkOrderItemFindAll(...args) },
	PurchaseInvoice: {
		create: (...args) => mockPurchaseInvoiceCreate(...args),
		findOne: (...args) => mockPurchaseInvoiceFindOne(...args),
		findAndCountAll: jest.fn(),
	},
	PurchaseInvoiceItem: { bulkCreate: (...args) => mockPurchaseInvoiceItemBulkCreate(...args) },
	PurchaseInvoiceCharge: { bulkCreate: (...args) => mockPurchaseInvoiceChargeBulkCreate(...args) },
	MasterOtherChargeType: {},
}));

const mockSumInvoicedQtyForPoWoItem = jest.fn();
const mockSumAcceptedQtyForPoWoItem = jest.fn();
jest.mock('../../repository/index', () => ({
	purchaseInvoiceItemsRepository: { sumInvoicedQtyForPoWoItem: (...args) => mockSumInvoicedQtyForPoWoItem(...args) },
	qcInspectionItemsRepository: { sumAcceptedQtyForPoWoItem: (...args) => mockSumAcceptedQtyForPoWoItem(...args) },
}));

const { Op } = require('sequelize');
const { sequelize, PurchaseInvoice } = require('../../models/index');
const piService = require('../purchase-invoice.service');

function baseReq(overrides = {}) {
	return { user: { id: 1, org_id: 7, name: 'Requester', email: 'r@x.com' }, ...overrides };
}

function poItem(overrides = {}) {
	return {
		id: 300,
		product_id: 1,
		qty: 100,
		price: 100,
		igst: 0,
		cgst: 9,
		sgst: 9,
		productSnapshot: { name: 'Cement' },
		...overrides,
	};
}

function poWithItems(overrides = {}) {
	return {
		id: 50,
		org_id: 7,
		vendorInfo: { vendor_id: 9, name: 'Acme Vendor', gstin: 'GST123' },
		items: [poItem()],
		...overrides,
	};
}

function woItem(overrides = {}) {
	return {
		id: 400,
		product_id: 1,
		qty: 100,
		price: 100,
		igst: 0,
		cgst: 9,
		sgst: 9,
		productSnapshot: { name: 'Labour' },
		...overrides,
	};
}

function woWithItems(overrides = {}) {
	return {
		id: 60,
		org_id: 7,
		wo_qc_check: false,
		vendorInfo: { vendor_id: 9, name: 'Acme Vendor', gstin: 'GST123' },
		items: [woItem()],
		...overrides,
	};
}

beforeEach(() => {
	jest.resetAllMocks();
	sequelize.transaction.mockResolvedValue(mockTransaction);
	mockWorkflowEngine.canActOnCurrentStage.mockResolvedValue({ allowed: true });
	mockWorkflowEngine.getInstanceWithStages.mockResolvedValue({
		instance: { currentStage: { stage_name: 'Purchase Invoice Approver' } },
	});
	mockWorkflowEngine.startInstance.mockResolvedValue({ status: 'in_progress' });
	mockPurchaseInvoiceCreate.mockResolvedValue({ id: 900, update: jest.fn().mockResolvedValue(undefined) });
	mockPurchaseInvoiceItemBulkCreate.mockResolvedValue([]);
	mockPurchaseInvoiceFindOne.mockResolvedValue({ id: 900, status: 'in_progress', items: [] });
});

describe('createPurchaseInvoice — quantity hard block (purchase_order)', () => {
	it('rejects a line whose invoiced_qty exceeds remaining received qty, no override', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems());
		mockGetReceivedQtyForPoItem.mockResolvedValue(60); // only 60 units ever received
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0); // nothing invoiced yet

		await expect(
			piService.createPurchaseInvoice(baseReq(), {
				document_type: 'purchase_order',
				document_id: 50,
				vendor_invoice_no: 'INV-1',
				vendor_invoice_date: '2026-08-20',
				items: [{ po_wo_item_id: 300, invoiced_qty: 70, price: 100, total: 7000 }],
			}),
		).rejects.toThrow(/only 60 remaining against received\/accepted qty of 60/);

		expect(mockTransaction.commit).not.toHaveBeenCalled();
	});

	it('blocks across multiple invoices — already-invoiced qty from other live invoices counts against the cap', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems());
		mockGetReceivedQtyForPoItem.mockResolvedValue(60);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(50); // a prior invoice already claimed 50

		await expect(
			piService.createPurchaseInvoice(baseReq(), {
				document_type: 'purchase_order',
				document_id: 50,
				vendor_invoice_no: 'INV-2',
				vendor_invoice_date: '2026-08-20',
				items: [{ po_wo_item_id: 300, invoiced_qty: 20, price: 100, total: 2000 }],
			}),
		).rejects.toThrow(/only 10 remaining/);
	});

	it('allows a line exactly at the remaining-qty ceiling', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems());
		mockGetReceivedQtyForPoItem.mockResolvedValue(60);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await expect(
			piService.createPurchaseInvoice(baseReq(), {
				document_type: 'purchase_order',
				document_id: 50,
				vendor_invoice_no: 'INV-3',
				vendor_invoice_date: '2026-08-20',
				items: [{ po_wo_item_id: 300, invoiced_qty: 60, price: 100, total: 6000 }],
			}),
		).resolves.toBeDefined();

		expect(mockTransaction.commit).toHaveBeenCalled();
	});
});

describe('createPurchaseInvoice — quantity hard block (work_order, QC optional)', () => {
	it('caps against QC accepted_qty when the WO requires QC', async () => {
		mockWorkOrderFindOne.mockResolvedValue(woWithItems({ wo_qc_check: true }));
		mockSumAcceptedQtyForPoWoItem.mockResolvedValue(60); // QC accepted only 60
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await expect(
			piService.createPurchaseInvoice(baseReq(), {
				document_type: 'work_order',
				document_id: 60,
				vendor_invoice_no: 'WINV-1',
				vendor_invoice_date: '2026-08-20',
				items: [{ po_wo_item_id: 400, invoiced_qty: 70, price: 100, total: 7000 }],
			}),
		).rejects.toThrow(/only 60 remaining against received\/accepted qty of 60/);

		expect(mockGetReceivedQtyForPoItem).not.toHaveBeenCalled();
		expect(mockTransaction.commit).not.toHaveBeenCalled();
	});

	it('caps against the WO item\'s own ordered qty when QC is bypassed (wo_qc_check false)', async () => {
		mockWorkOrderFindOne.mockResolvedValue(woWithItems({ wo_qc_check: false, items: [woItem({ qty: 100 })] }));
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await expect(
			piService.createPurchaseInvoice(baseReq(), {
				document_type: 'work_order',
				document_id: 60,
				vendor_invoice_no: 'WINV-2',
				vendor_invoice_date: '2026-08-20',
				items: [{ po_wo_item_id: 400, invoiced_qty: 150, price: 100, total: 15000 }],
			}),
		).rejects.toThrow(/only 100 remaining against received\/accepted qty of 100/);

		expect(mockSumAcceptedQtyForPoWoItem).not.toHaveBeenCalled();
	});

	it('allows a WO line at the ordered-qty ceiling when QC is bypassed', async () => {
		mockWorkOrderFindOne.mockResolvedValue(woWithItems({ wo_qc_check: false, items: [woItem({ qty: 100 })] }));
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await expect(
			piService.createPurchaseInvoice(baseReq(), {
				document_type: 'work_order',
				document_id: 60,
				vendor_invoice_no: 'WINV-3',
				vendor_invoice_date: '2026-08-20',
				items: [{ po_wo_item_id: 400, invoiced_qty: 100, price: 100, total: 10000 }],
			}),
		).resolves.toBeDefined();

		expect(mockPurchaseInvoiceCreate).toHaveBeenCalledWith(
			expect.objectContaining({ document_type: 'work_order', purchase_order_id: null, work_order_id: 60 }),
			expect.anything(),
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});
});

describe('createPurchaseInvoice — price/tax variance soft flag', () => {
	it('flags a line (and rolls up the header) when price differs beyond tolerance, but still creates it', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems({ items: [poItem({ price: 100 })] }));
		mockGetReceivedQtyForPoItem.mockResolvedValue(100);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await piService.createPurchaseInvoice(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			vendor_invoice_no: 'INV-4',
			vendor_invoice_date: '2026-08-20',
			// 110 vs PO's 100 = 10% variance, well beyond the 2% tolerance.
			items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 110, total: 1100 }],
		});

		expect(mockTransaction.commit).toHaveBeenCalled();
		expect(mockPurchaseInvoiceCreate).toHaveBeenCalledWith(
			expect.objectContaining({ matching_status: 'variance_flagged' }),
			expect.anything(),
		);
		expect(mockPurchaseInvoiceItemBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ matching_status: 'variance_flagged' })],
			expect.anything(),
		);
	});

	it('does not flag a line within tolerance', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems({ items: [poItem({ price: 100, igst: 0, cgst: 9, sgst: 9 })] }));
		mockGetReceivedQtyForPoItem.mockResolvedValue(100);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await piService.createPurchaseInvoice(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			vendor_invoice_no: 'INV-5',
			vendor_invoice_date: '2026-08-20',
			// Same tax split as the PO item — isolates the price-only comparison.
			items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 101, igst: 0, cgst: 9, sgst: 9, total: 1010 }],
		});

		expect(mockPurchaseInvoiceCreate).toHaveBeenCalledWith(
			expect.objectContaining({ matching_status: 'matched' }),
			expect.anything(),
		);
	});

	// Regression test: docItem.igst/cgst/sgst are absolute amounts for the PO
	// item's full ordered_qty (100 here), while the invoice line's are for
	// whatever qty is actually being invoiced (10, a normal partial MRN-based
	// invoice) — comparing those two absolute amounts directly would flag
	// every partial invoice as a tax variance even when the tax rate/id is
	// identical, which is exactly the bug this locks in against.
	it('does not flag a partial-qty line whose tax_id matches, even though absolute tax amounts differ from the full-qty PO item', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(
			poWithItems({ items: [poItem({ price: 100, qty: 100, tax_id: 1, igst: 0, cgst: 900, sgst: 900 })] }),
		);
		mockGetReceivedQtyForPoItem.mockResolvedValue(100);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await piService.createPurchaseInvoice(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			vendor_invoice_no: 'INV-5B',
			vendor_invoice_date: '2026-08-20',
			// Same price and same tax_id as the PO item, just a partial qty (10 of
			// 100) — so this line's own igst/cgst/sgst (proportional to 10 units)
			// are correctly much smaller than the PO item's (for 100 units).
			items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100, tax_id: 1, igst: 0, cgst: 90, sgst: 90, total: 1180 }],
		});

		expect(mockPurchaseInvoiceCreate).toHaveBeenCalledWith(
			expect.objectContaining({ matching_status: 'matched' }),
			expect.anything(),
		);
		expect(mockPurchaseInvoiceItemBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ matching_status: 'matched', tax_variance_flag: false })],
			expect.anything(),
		);
	});
});

describe('createPurchaseInvoice — vendor invoice date must not regress against the same order', () => {
	it('rejects a vendor_invoice_date earlier than the latest live invoice already recorded for this PO', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems());
		mockGetReceivedQtyForPoItem.mockResolvedValue(100);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);
		mockPurchaseInvoiceFindOne.mockResolvedValueOnce({ id: 899, vendor_invoice_date: '2026-09-03' });

		await expect(
			piService.createPurchaseInvoice(baseReq(), {
				document_type: 'purchase_order',
				document_id: 50,
				vendor_invoice_no: 'INV-6',
				vendor_invoice_date: '2026-08-31',
				items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100, total: 1000 }],
			}),
		).rejects.toThrow(/cannot be earlier than/i);

		expect(mockTransaction.commit).not.toHaveBeenCalled();
	});

	it('allows a vendor_invoice_date on or after the latest live invoice', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems());
		mockGetReceivedQtyForPoItem.mockResolvedValue(100);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);
		mockPurchaseInvoiceFindOne.mockResolvedValueOnce({ id: 899, vendor_invoice_date: '2026-08-31' });

		await expect(
			piService.createPurchaseInvoice(baseReq(), {
				document_type: 'purchase_order',
				document_id: 50,
				vendor_invoice_no: 'INV-7',
				vendor_invoice_date: '2026-08-31',
				items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100, total: 1000 }],
			}),
		).resolves.toBeDefined();

		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	it('ignores rejected/cancelled invoices when looking for the latest date (query scopes to LIVE_STATUSES)', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems());
		mockGetReceivedQtyForPoItem.mockResolvedValue(100);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);
		// A rejected invoice dated after ours would never be returned by the real
		// query (it filters status IN LIVE_STATUSES) — asserting the where clause
		// here locks in that a rejected/cancelled invoice's date can't block a
		// legitimately earlier one.
		mockPurchaseInvoiceFindOne.mockResolvedValueOnce(null);

		await piService.createPurchaseInvoice(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			vendor_invoice_no: 'INV-8',
			vendor_invoice_date: '2026-08-31',
			items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100, total: 1000 }],
		});

		expect(mockPurchaseInvoiceFindOne).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					document_type: 'purchase_order',
					purchase_order_id: 50,
					status: { [Op.in]: ['draft', 'in_progress', 'approved'] },
				}),
			}),
		);
	});
});

describe('createPurchaseInvoice — other charges (freight, loading/unloading, etc.)', () => {
	// Payload shape is the same generic Charge the shared <ChargesTable> component
	// sends for PO/WO: name/calculationType/value/operation/applyOn/taxTreatment/
	// taxRate — see purchase-invoice.service.js's header comment on preparedCharges.
	it('rejects a charge with no name', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems());
		mockGetReceivedQtyForPoItem.mockResolvedValue(60);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await expect(
			piService.createPurchaseInvoice(baseReq(), {
				document_type: 'purchase_order',
				document_id: 50,
				vendor_invoice_no: 'INV-6',
				vendor_invoice_date: '2026-08-20',
				items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100, total: 1000 }],
				other_charges: [{ value: 500 }],
			}),
		).rejects.toThrow(/requires a name/);

		expect(mockTransaction.commit).not.toHaveBeenCalled();
	});

	it('rejects a charge with an invalid amount', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems());
		mockGetReceivedQtyForPoItem.mockResolvedValue(60);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await expect(
			piService.createPurchaseInvoice(baseReq(), {
				document_type: 'purchase_order',
				document_id: 50,
				vendor_invoice_no: 'INV-7',
				vendor_invoice_date: '2026-08-20',
				items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100, total: 1000 }],
				other_charges: [{ name: 'Freight', value: -50 }],
			}),
		).rejects.toThrow(/requires a valid amount/);
	});

	it('is never checked against the qty hard-block or price/tax variance — no order baseline exists for it', async () => {
		// same_state + a real tax rate on both the item and the charge — since the
		// backend now computes igst/cgst/sgst/total itself (charge-tax-engine.util.js)
		// rather than trusting whatever the client sends, the fixture needs an actual
		// rate to derive from instead of just asserting arbitrary client-sent numbers.
		mockPurchaseOrderFindOne.mockResolvedValue(
			poWithItems({ same_state: true, items: [poItem({ price: 100, tax_id: 1 })] }),
		);
		mockGetReceivedQtyForPoItem.mockResolvedValue(10);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await piService.createPurchaseInvoice(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			vendor_invoice_no: 'INV-8',
			vendor_invoice_date: '2026-08-20',
			items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100, tax_id: 1, taxSnapshot: { rate: 18 } }],
			// A large, unmatched transportation charge — should pass through
			// untouched by matching_status regardless of size. amount*18% = 900 tax.
			other_charges: [
				{ name: 'Local cartage', value: 5000, applyOn: 'NET_TAXABLE_AMOUNT', taxTreatment: 'SPECIFIC_RATE', taxRate: 18 },
			],
		});

		expect(mockTransaction.commit).toHaveBeenCalled();
		expect(mockPurchaseInvoiceChargeBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ amount: 5000, cgst: 450, sgst: 450, total: 5900, description: 'Local cartage' })],
			expect.anything(),
		);
		// matching_status stays scoped to the item, unaffected by the charge.
		expect(mockPurchaseInvoiceCreate).toHaveBeenCalledWith(
			expect.objectContaining({ matching_status: 'matched' }),
			expect.anything(),
		);
	});

	it('folds charge amounts into the invoice header totals (grandTotal, total_tax, total_taxable)', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(
			poWithItems({ same_state: true, items: [poItem({ price: 100 })] }),
		);
		mockGetReceivedQtyForPoItem.mockResolvedValue(10);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await piService.createPurchaseInvoice(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			vendor_invoice_no: 'INV-9',
			vendor_invoice_date: '2026-08-20',
			// 10 units * 100 = 1000 taxable, no tax_id on the item itself -> zero item tax.
			items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100 }],
			// 500 taxable @ 18% = 90 tax -> 590 total charge.
			other_charges: [{ name: 'Freight', value: 500, taxTreatment: 'SPECIFIC_RATE', taxRate: 18 }],
		});

		expect(mockPurchaseInvoiceCreate).toHaveBeenCalledWith(
			expect.objectContaining({ total_taxable: 1500, total_tax: 90, grandTotal: 1590 }),
			expect.anything(),
		);
	});

	it('does not call PurchaseInvoiceCharge.bulkCreate when no charges are submitted', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems());
		mockGetReceivedQtyForPoItem.mockResolvedValue(60);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await piService.createPurchaseInvoice(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			vendor_invoice_no: 'INV-10',
			vendor_invoice_date: '2026-08-20',
			items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100, total: 1000 }],
		});

		expect(mockPurchaseInvoiceChargeBulkCreate).not.toHaveBeenCalled();
	});

	it('recomputes item and charge tax server-side via the shared engine, ignoring client-sent igst/cgst/sgst/total', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(
			poWithItems({ same_state: false, items: [poItem({ price: 100, tax_id: 1 })] }),
		);
		mockGetReceivedQtyForPoItem.mockResolvedValue(10);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await piService.createPurchaseInvoice(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			vendor_invoice_no: 'INV-11',
			vendor_invoice_date: '2026-08-20',
			// Deliberately wrong client-sent tax fields — must be ignored.
			items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100, tax_id: 1, taxSnapshot: { rate: 18 }, igst: 999, cgst: 999, sgst: 999, total: 999 }],
			// Non-taxable charge — must compute zero tax regardless of what's sent.
			other_charges: [{ name: 'Packing', value: 1000, taxTreatment: 'NON_TAXABLE', igst: 999, total: 999 }],
		});

		// item: 1000 taxable @ 18% inter-state = 180 igst, total 1180.
		expect(mockPurchaseInvoiceItemBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ igst: 180, cgst: 0, sgst: 0, total: 1180 })],
			expect.anything(),
		);
		// non-taxable charge: zero tax, total === amount.
		expect(mockPurchaseInvoiceChargeBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ amount: 1000, igst: 0, cgst: 0, sgst: 0, total: 1000 })],
			expect.anything(),
		);
		expect(mockPurchaseInvoiceCreate).toHaveBeenCalledWith(
			expect.objectContaining({ total_taxable: 2000, total_tax: 180, grandTotal: 2180 }),
			expect.anything(),
		);
	});

	it('post-tax charges are excluded from total_taxable/total_tax but included in grandTotal', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems({ same_state: false, items: [poItem({ price: 100 })] }));
		mockGetReceivedQtyForPoItem.mockResolvedValue(10);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await piService.createPurchaseInvoice(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			vendor_invoice_no: 'INV-12',
			vendor_invoice_date: '2026-08-20',
			items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100 }],
			other_charges: [{ name: 'Rounding adjustment', value: 500, applyOn: 'AFTER_TAX' }],
		});

		expect(mockPurchaseInvoiceChargeBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ amount: 500, igst: 0, total: 500, charge_basis: 'post_tax' })],
			expect.anything(),
		);
		expect(mockPurchaseInvoiceCreate).toHaveBeenCalledWith(
			expect.objectContaining({ total_taxable: 1000, total_tax: 0, grandTotal: 1500 }),
			expect.anything(),
		);
	});

	it('a percentage-mode charge resolves `value` as the raw percentage number, not a pre-resolved rupee figure', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems({ same_state: false, items: [poItem({ price: 100 })] }));
		mockGetReceivedQtyForPoItem.mockResolvedValue(10);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await piService.createPurchaseInvoice(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			vendor_invoice_no: 'INV-13',
			vendor_invoice_date: '2026-08-20',
			// 10 units * 100 = 1000 taxable, no item tax.
			items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100 }],
			// 10% of the 1000 taxable base = 100 — NOT ₹10 (would happen if `value`
			// were misread as an already-resolved rupee figure instead of a raw %).
			other_charges: [{ name: 'Discount recovery', value: 10, calculationType: 'PERCENTAGE' }],
		});

		expect(mockPurchaseInvoiceChargeBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ amount: 10, total: 100 })],
			expect.anything(),
		);
		expect(mockPurchaseInvoiceCreate).toHaveBeenCalledWith(
			expect.objectContaining({ total_taxable: 1100, grandTotal: 1100 }),
			expect.anything(),
		);
	});

	it('a taxable post-tax charge contributes its own tax to grandTotal without double-counting it into total_tax', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems({ same_state: false, items: [poItem({ price: 100 })] }));
		mockGetReceivedQtyForPoItem.mockResolvedValue(10);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await piService.createPurchaseInvoice(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			vendor_invoice_no: 'INV-14',
			vendor_invoice_date: '2026-08-20',
			// 10 units * 100 = 1000 taxable, no item tax.
			items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100 }],
			// Post-tax + taxable: amount 1000 @ 18% = 180 tax -> charge total 1180,
			// landing entirely in grandTotal. total_tax must stay 0 (items+pre-tax-charges
			// only, per PI's own documented convention) — NOT 180.
			other_charges: [
				{ name: 'Service fee', value: 1000, applyOn: 'AFTER_TAX', taxTreatment: 'SPECIFIC_RATE', taxRate: 18 },
			],
		});

		expect(mockPurchaseInvoiceChargeBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ amount: 1000, igst: 180, total: 1180, charge_basis: 'post_tax' })],
			expect.anything(),
		);
		expect(mockPurchaseInvoiceCreate).toHaveBeenCalledWith(
			expect.objectContaining({ total_taxable: 1000, total_tax: 0, grandTotal: 2180 }),
			expect.anything(),
		);
	});

	it('inherit-item-tax allocates a pre-tax charge proportionally across the invoice items own GST rate(s)', async () => {
		// A newly-possible tax treatment for PI — previously there was no equivalent at
		// all (a charge was either SPECIFIC_RATE via tax_id, or untaxed).
		mockPurchaseOrderFindOne.mockResolvedValue(
			poWithItems({ same_state: true, items: [poItem({ price: 100, tax_id: 1 })] }),
		);
		mockGetReceivedQtyForPoItem.mockResolvedValue(10);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);

		await piService.createPurchaseInvoice(baseReq(), {
			document_type: 'purchase_order',
			document_id: 50,
			vendor_invoice_no: 'INV-15',
			vendor_invoice_date: '2026-08-20',
			// 1000 taxable @ 18%.
			items: [{ po_wo_item_id: 300, invoiced_qty: 10, price: 100, tax_id: 1, taxSnapshot: { rate: 18 } }],
			// 10% contingency, inherits the item's own 18% rate (only one rate present).
			other_charges: [{ name: 'Contingency', value: 10, calculationType: 'PERCENTAGE', taxTreatment: 'INHERIT_ITEM_TAX' }],
		});

		// `amount` column stores the raw entered number (10, meaning 10%) per PI's own
		// convention; the resolved base (100 = 10% of 1000) only shows up in the tax/total.
		// tax = 100*18% = 18, split 9/9, total = 100+18 = 118.
		expect(mockPurchaseInvoiceChargeBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ amount: 10, cgst: 9, sgst: 9, total: 118 })],
			expect.anything(),
		);
	});
});

describe('getInvoiceableItems', () => {
	it('computes remaining_invoiceable_qty as received minus already invoiced (purchase_order)', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue(poWithItems());
		mockGetReceivedQtyForPoItem.mockResolvedValue(60);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(25);

		const result = await piService.getInvoiceableItems(baseReq(), { document_type: 'purchase_order', document_id: 50 });

		expect(result.items[0]).toEqual(
			expect.objectContaining({ received_qty: 60, already_invoiced_qty: 25, remaining_invoiceable_qty: 35 }),
		);
		expect(result.can_create_invoice).toBe(true);
	});

	it('computes remaining_invoiceable_qty against QC accepted_qty (work_order, QC required)', async () => {
		mockWorkOrderFindOne.mockResolvedValue(woWithItems({ wo_qc_check: true }));
		mockSumAcceptedQtyForPoWoItem.mockResolvedValue(80);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(30);

		const result = await piService.getInvoiceableItems(baseReq(), { document_type: 'work_order', document_id: 60 });

		expect(result.items[0]).toEqual(
			expect.objectContaining({ received_qty: 80, already_invoiced_qty: 30, remaining_invoiceable_qty: 50 }),
		);
	});

	it('computes remaining_invoiceable_qty against ordered qty (work_order, QC bypassed)', async () => {
		mockWorkOrderFindOne.mockResolvedValue(woWithItems({ wo_qc_check: false, items: [woItem({ qty: 100 })] }));
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(40);

		const result = await piService.getInvoiceableItems(baseReq(), { document_type: 'work_order', document_id: 60 });

		expect(result.items[0]).toEqual(
			expect.objectContaining({ received_qty: 100, already_invoiced_qty: 40, remaining_invoiceable_qty: 60 }),
		);
		expect(mockSumAcceptedQtyForPoWoItem).not.toHaveBeenCalled();
	});
});

describe('approvePurchaseInvoice — re-validates the cap at approval time', () => {
	it('rejects approval if received/invoiced qty moved since the invoice was raised (purchase_order)', async () => {
		mockPurchaseInvoiceFindOne.mockResolvedValue({
			id: 900,
			status: 'in_progress',
			document_type: 'purchase_order',
			purchase_order_id: 50,
			work_order_id: null,
			items: [{ po_wo_item_id: 300, invoiced_qty: 50, productSnapshot: { name: 'Cement' } }],
			update: jest.fn().mockResolvedValue(undefined),
		});
		mockPurchaseOrderFindOne.mockResolvedValue({ id: 50, org_id: 7 });
		mockPurchaseOrderItemFindAll.mockResolvedValue([poItem()]);
		// Received/invoiced figures shifted downward since creation (e.g. a
		// sibling invoice consumed the remaining qty first).
		mockGetReceivedQtyForPoItem.mockResolvedValue(60);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(40); // another invoice already claims 40 of the 60

		await expect(piService.approvePurchaseInvoice(baseReq(), 900)).rejects.toThrow(/can no longer be approved/);
		expect(mockTransaction.commit).not.toHaveBeenCalled();
	});

	it('approves and advances the workflow when the cap still holds (purchase_order)', async () => {
		const updateFn = jest.fn().mockResolvedValue(undefined);
		mockPurchaseInvoiceFindOne.mockResolvedValue({
			id: 900,
			status: 'in_progress',
			document_type: 'purchase_order',
			purchase_order_id: 50,
			work_order_id: null,
			items: [{ po_wo_item_id: 300, invoiced_qty: 50, productSnapshot: { name: 'Cement' } }],
			update: updateFn,
		});
		mockPurchaseOrderFindOne.mockResolvedValue({ id: 50, org_id: 7 });
		mockPurchaseOrderItemFindAll.mockResolvedValue([poItem()]);
		mockGetReceivedQtyForPoItem.mockResolvedValue(60);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(0);
		mockWorkflowEngine.advanceStage.mockResolvedValue({ status: 'approved' });

		await piService.approvePurchaseInvoice(baseReq(), 900);

		expect(mockWorkflowEngine.advanceStage).toHaveBeenCalledWith(
			expect.objectContaining({ documentType: 'purchase_invoice', documentId: 900, action: 'approved' }),
		);
		expect(updateFn).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'approved' }),
			expect.anything(),
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	it('re-validates a work_order-anchored invoice against QC accepted_qty', async () => {
		mockPurchaseInvoiceFindOne.mockResolvedValue({
			id: 901,
			status: 'in_progress',
			document_type: 'work_order',
			purchase_order_id: null,
			work_order_id: 60,
			items: [{ po_wo_item_id: 400, invoiced_qty: 50, productSnapshot: { name: 'Labour' } }],
			update: jest.fn().mockResolvedValue(undefined),
		});
		mockWorkOrderFindOne.mockResolvedValue({ id: 60, org_id: 7, wo_qc_check: true });
		mockWorkOrderItemFindAll.mockResolvedValue([woItem()]);
		mockSumAcceptedQtyForPoWoItem.mockResolvedValue(60);
		mockSumInvoicedQtyForPoWoItem.mockResolvedValue(40); // another invoice already claims 40 of the 60

		await expect(piService.approvePurchaseInvoice(baseReq(), 901)).rejects.toThrow(/can no longer be approved/);
		expect(mockTransaction.commit).not.toHaveBeenCalled();
	});
});
