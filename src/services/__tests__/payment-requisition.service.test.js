'use strict';

// payment-requisition.service.js pulls in PDF/S3 machinery it doesn't need for the
// financial-logic paths under test — stub those out (same rationale as
// purchase-order.service.test.js).
jest.mock('../../pdf/htmlPdfGenerator', () => ({ generateInvoiceHTML: jest.fn() }));
jest.mock('../../utils/s3Bucket', () => ({ generateSignedUrl: jest.fn() }));
jest.mock('../../helpers/fetchPermissions', () => jest.fn().mockResolvedValue(['payment-requisition:approver']));
jest.mock('../auditLog.service', () => ({ record: jest.fn().mockResolvedValue(undefined) }));

const mockCreateLiabilities = jest.fn().mockResolvedValue([]);
const mockCancelLiabilities = jest.fn().mockResolvedValue([]);
jest.mock('../tds-liability.service', () => ({
	createLiabilitiesForApprovedRequisition: (...args) => mockCreateLiabilities(...args),
	cancelLiabilitiesForRequisition: (...args) => mockCancelLiabilities(...args),
}));

const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { UPDATE: 'UPDATE' } };

const mockPurchaseOrderFindByPk = jest.fn();
const mockPurchaseOrderFindOne = jest.fn();
const mockPurchaseOrderUpdate = jest.fn().mockResolvedValue([1]);
const mockPaymentRequisitionFindOne = jest.fn();
const mockPaymentRequisitionCount = jest.fn().mockResolvedValue(0);
const mockTdsLiabilityCount = jest.fn().mockResolvedValue(0);
const mockPurchaseInvoiceCount = jest.fn().mockResolvedValue(0);
const mockPurchaseInvoiceFindOne = jest.fn();
const mockPurchaseInvoiceFindByPk = jest.fn();

const mockSequelizeQuery = jest.fn();

jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn(), query: (...args) => mockSequelizeQuery(...args) },
	PaymentRequisition: {
		findOne: (...args) => mockPaymentRequisitionFindOne(...args),
		count: (...args) => mockPaymentRequisitionCount(...args),
	},
	PaymentRequisitionDeduction: {},
	PurchaseOrder: {
		findByPk: (...args) => mockPurchaseOrderFindByPk(...args),
		findOne: (...args) => mockPurchaseOrderFindOne(...args),
		update: (...args) => mockPurchaseOrderUpdate(...args),
		name: 'PurchaseOrder',
	},
	WorkOrder: { findByPk: jest.fn(), findOne: jest.fn(), update: jest.fn(), name: 'WorkOrder' },
	// PurchaseInvoice's own count defaults to 0 (no invoice exists) so every
	// pre-existing PO-direct test keeps working unless it explicitly opts in
	// via the "Invoice path" describe block below.
	PurchaseInvoice: {
		count: (...args) => mockPurchaseInvoiceCount(...args),
		findOne: (...args) => mockPurchaseInvoiceFindOne(...args),
		findByPk: (...args) => mockPurchaseInvoiceFindByPk(...args),
	},
	User: {},
	organization: {},
	Role: {},
	CostCenter: {},
	TdsLiability: { count: (...args) => mockTdsLiabilityCount(...args) },
}));

const mockPrCreate = jest.fn();
const mockPrUpdateById = jest.fn().mockResolvedValue([1]);
const mockPrFindById = jest.fn();
jest.mock('../../repository/payment-requisition.repository', () => ({
	create: (...args) => mockPrCreate(...args),
	updateById: (...args) => mockPrUpdateById(...args),
	findById: (...args) => mockPrFindById(...args),
	findAll: jest.fn(),
	findLastCreated: jest.fn(),
	deleteById: jest.fn(),
}));

const mockDeductionBulkCreate = jest.fn().mockResolvedValue([]);
const mockDeductionFindByRequisitionId = jest.fn().mockResolvedValue([]);
jest.mock('../../repository/payment-requisition-deduction.repository', () => ({
	bulkCreate: (...args) => mockDeductionBulkCreate(...args),
	findByRequisitionId: (...args) => mockDeductionFindByRequisitionId(...args),
	deleteByRequisitionId: jest.fn(),
	deleteById: jest.fn(),
	findById: jest.fn(),
	updateById: jest.fn(),
}));

const mockGetRetentionSummary = jest.fn().mockResolvedValue({ retention_held: 0, retention_released: 0, retention_balance: 0 });
const mockGetRetentionSummaryForPo = jest.fn().mockResolvedValue({ retention_held: 0, retention_released: 0, retention_balance: 0 });
const mockGetRetentionSummaryForWo = jest.fn().mockResolvedValue({ retention_held: 0, retention_released: 0, retention_balance: 0 });
const mockGetPoWoFinancialSummary = jest.fn().mockResolvedValue({ total_gross: 0 });
jest.mock('../../repository/payment-requisition-analytics.repository', () => ({
	getRetentionSummary: (...args) => mockGetRetentionSummary(...args),
	getRetentionSummaryForPo: (...args) => mockGetRetentionSummaryForPo(...args),
	getRetentionSummaryForWo: (...args) => mockGetRetentionSummaryForWo(...args),
	getPoWoFinancialSummary: (...args) => mockGetPoWoFinancialSummary(...args),
	getDeductionBreakdownByPoWo: jest.fn(),
	getFullLedgerByPoWo: jest.fn(),
}));

jest.mock('../../repository/tds-liability.repository', () => ({
	findByDeductionId: jest.fn(),
}));

const { sequelize, WorkOrder } = require('../../models/index');
const prService = require('../payment-requisition.service');

function baseReq(overrides = {}) {
	return { user: { id: 1, org_id: 7, name: 'Finance User', email: 'f@x.com' }, ...overrides };
}

beforeEach(() => {
	jest.clearAllMocks();
	sequelize.transaction.mockResolvedValue(mockTransaction);
	mockPrCreate.mockResolvedValue({ id: 501, org_id: 7 });
	mockPrFindById.mockResolvedValue({ id: 501, org_id: 7, po_id: 200, gross_amount: 100000, net_payable: 90000, status: 'PENDING', deductions: [] });
	// Default: PO received-value and grandTotal far exceed any test's gross
	// amount, so the new receipt-value cap (see "receipt-value cap" describe
	// blocks below) is a no-op for every pre-existing test unless a test
	// explicitly overrides these.
	mockSequelizeQuery.mockResolvedValue([{ price: 999999999, received_qty: 1 }]);
	mockGetPoWoFinancialSummary.mockResolvedValue({ total_gross: 0 });
	mockPurchaseOrderFindByPk.mockResolvedValue({ retention_amount: 999999999, grandTotal: 999999999 });
	// Default: no Purchase Invoice exists yet for any PO, so PO-direct stays
	// open and the new "PO-direct closes once invoiced" gate is a no-op for
	// every pre-existing test unless a test explicitly opts in.
	mockPurchaseInvoiceCount.mockResolvedValue(0);
	mockPaymentRequisitionCount.mockResolvedValue(0);
	mockGetRetentionSummaryForPo.mockResolvedValue({ retention_held: 0, retention_released: 0, retention_balance: 0 });
	mockGetRetentionSummaryForWo.mockResolvedValue({ retention_held: 0, retention_released: 0, retention_balance: 0 });
});

describe('createPaymentRequisition — retention cap', () => {
	test('rejects a RETENTION deduction that would exceed the PO retention cap', async () => {
		mockPurchaseOrderFindByPk.mockResolvedValue({ retention_amount: 5000, grandTotal: 999999999 });
		mockGetRetentionSummaryForPo.mockResolvedValue({ retention_held: 4000, retention_released: 0, retention_balance: 4000 });

		await expect(
			prService.createPaymentRequisition(baseReq(), {
				requisitionAgainst: 'PO',
				poWoId: 200,
				grossAmount: 50000,
				deductions: [{ deduction_type: 'RETENTION', amount: 2000 }],
			}),
		).rejects.toThrow(/Retention cap exceeded/);

		expect(mockTransaction.rollback).toHaveBeenCalled();
		// The PO row must have been locked before the comparison.
		expect(mockPurchaseOrderFindByPk).toHaveBeenCalledWith(
			200,
			expect.objectContaining({ lock: mockTransaction.LOCK.UPDATE, transaction: mockTransaction }),
		);
	});

	test('allows a RETENTION deduction within the cap', async () => {
		mockPurchaseOrderFindByPk.mockResolvedValue({ retention_amount: 5000, grandTotal: 999999999 });
		mockGetRetentionSummaryForPo.mockResolvedValue({ retention_held: 1000, retention_released: 0, retention_balance: 1000 });

		await prService.createPaymentRequisition(baseReq(), {
			requisitionAgainst: 'PO',
			poWoId: 200,
			grossAmount: 50000,
			deductions: [{ deduction_type: 'RETENTION', amount: 2000 }],
		});

		expect(mockTransaction.commit).toHaveBeenCalled();
	});
});

describe('createPaymentRequisition — TDS is computed on the taxable value, not GST-inclusive gross', () => {
	// PO: taxable 36000, GST 4320, grandTotal 40320 (the real PO from the bug report).
	// A 50%-of-order requisition -> gross 20160. 5% TDS must land on the taxable
	// slice of that gross (20160 * 36000/40320 = 18000), i.e. 900 — not on gross
	// itself (which would wrongly give 1008).
	test('a percentage-driven TDS line is recomputed server-side from the taxable base, ignoring the client amount', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue({ total_taxable: 36000, grandTotal: 40320 });

		await prService.createPaymentRequisition(baseReq(), {
			requisitionAgainst: 'PO',
			poWoId: 200,
			grossAmount: 20160,
			// amount is deliberately wrong (what the old client-side calc would have
			// sent) to prove the server ignores it and recomputes from percentage.
			deductions: [{ deduction_type: 'TDS', percentage: 5, amount: 1008 }],
		});

		expect(mockDeductionBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ deduction_type: 'TDS', amount: 900 })],
			{ transaction: mockTransaction },
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	test('GST_TDS is also computed on the taxable base', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue({ total_taxable: 36000, grandTotal: 40320 });

		await prService.createPaymentRequisition(baseReq(), {
			requisitionAgainst: 'PO',
			poWoId: 200,
			grossAmount: 20160,
			deductions: [{ deduction_type: 'GST_TDS', percentage: 2, amount: 999999 }],
		});

		expect(mockDeductionBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ deduction_type: 'GST_TDS', amount: 360 })], // 18000 * 2%
			{ transaction: mockTransaction },
		);
	});

	test('a flat (no-percentage) TDS amount is trusted as-is, since there is no base to recompute from', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue({ total_taxable: 36000, grandTotal: 40320 });

		await prService.createPaymentRequisition(baseReq(), {
			requisitionAgainst: 'PO',
			poWoId: 200,
			grossAmount: 20160,
			deductions: [{ deduction_type: 'TDS', amount: 750 }],
		});

		expect(mockDeductionBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ deduction_type: 'TDS', amount: 750 })],
			{ transaction: mockTransaction },
		);
	});

	test('RETENTION stays gross-based even with a percentage set — it is not a tax computation', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue({ total_taxable: 36000, grandTotal: 40320 });
		mockPurchaseOrderFindByPk.mockResolvedValue({ retention_amount: 50000, grandTotal: 999999999 });
		mockGetRetentionSummaryForPo.mockResolvedValue({ retention_held: 0, retention_released: 0, retention_balance: 0 });

		await prService.createPaymentRequisition(baseReq(), {
			requisitionAgainst: 'PO',
			poWoId: 200,
			grossAmount: 20160,
			// 5% of gross (20160), computed client-side and trusted as-is: 1008.
			deductions: [{ deduction_type: 'RETENTION', percentage: 5, amount: 1008 }],
		});

		expect(mockDeductionBulkCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ deduction_type: 'RETENTION', amount: 1008 })],
			{ transaction: mockTransaction },
		);
	});
});

describe('createPaymentRequisition — pre-approved creation', () => {
	test('creating directly with status APPROVED syncs PO totals and creates TDS liabilities', async () => {
		mockPrFindById.mockResolvedValue({ id: 501, org_id: 7, po_id: 200, gross_amount: 100000, net_payable: 98000, status: 'APPROVED', deductions: [] });
		mockPurchaseOrderFindOne.mockResolvedValue({ grandTotal: 100000, totalPaid: 0 });

		await prService.createPaymentRequisition(baseReq(), {
			requisitionAgainst: 'PO',
			poWoId: 200,
			grossAmount: 100000,
			deductions: [{ deduction_type: 'TDS', amount: 2000 }],
			status: 'APPROVED',
		});

		expect(mockPurchaseOrderUpdate).toHaveBeenCalled();
		expect(mockCreateLiabilities).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 501 }), mockTransaction);
	});
});

describe('regression: PO/WO totalPaid must reach grandTotal once fully requisitioned, even with TDS', () => {
	// Reproduces the reported bug: a PO with grandTotal 40320, requisitioned via two
	// REGULAR PRs (gross 20160 each, TDS 1008 each -> net_payable 19152 each) summing
	// to exactly 100% of gross. Under the old net_payable-based sync, totalPaid would
	// max out at 38304 (2 x 19152) and remainingAmount would be permanently stuck at
	// 2016 (== total TDS) even though the PO was fully requisitioned. It must now
	// reach totalPaid=40320 / remainingAmount=0 / paymentStatus=PAID.
	test('two fully-requisitioned TDS-bearing PRs bring remainingAmount to zero, not to the TDS total', async () => {
		let poState = { grandTotal: 40320, totalPaid: 0 };
		mockPurchaseOrderFindOne.mockImplementation(() => Promise.resolve({ ...poState }));
		mockPurchaseOrderUpdate.mockImplementation((data) => {
			poState = { ...poState, totalPaid: data.totalPaid };
			return Promise.resolve([1]);
		});

		function approveRequisition(id) {
			mockPaymentRequisitionFindOne.mockResolvedValue({ id, org_id: 7 });
			mockPrFindById.mockResolvedValue({
				id,
				org_id: 7,
				po_id: 31,
				wo_id: null,
				gross_amount: 20160,
				total_deductions: 1008,
				net_payable: 19152,
				status: 'PENDING',
				requisition_type: 'REGULAR',
				requisition_against: 'PO',
				authorized_by_id: null,
				deductions: [],
			});
			return prService.updatePaymentRequisition(baseReq(), id, {
				status: 'APPROVED',
				grossAmount: 20160,
				deductions: [{ deduction_type: 'TDS', amount: 1008 }],
			});
		}

		await approveRequisition(12);
		expect(poState.totalPaid).toBe(20160);

		await approveRequisition(14);
		expect(poState.totalPaid).toBe(40320);

		const finalRemaining = Math.max(0, poState.grandTotal - poState.totalPaid);
		expect(finalRemaining).toBe(0);
		expect(mockPurchaseOrderUpdate).toHaveBeenLastCalledWith(
			expect.objectContaining({ totalPaid: 40320, remainingAmount: 0, paymentStatus: 'PAID' }),
			expect.anything(),
		);
	});
});

describe('updatePaymentRequisition — approval triggers liability creation', () => {
	test('PENDING -> APPROVED creates TDS liabilities exactly once', async () => {
		mockPaymentRequisitionFindOne.mockResolvedValue({ id: 501, org_id: 7 });
		mockPrFindById.mockResolvedValue({
			id: 501,
			org_id: 7,
			po_id: 200,
			wo_id: null,
			gross_amount: 100000,
			total_deductions: 2000,
			net_payable: 98000,
			status: 'PENDING',
			requisition_type: 'REGULAR',
			requisition_against: 'PO',
			authorized_by_id: null,
			deductions: [],
		});
		mockPurchaseOrderFindOne.mockResolvedValue({ grandTotal: 100000, totalPaid: 0 });

		await prService.updatePaymentRequisition(baseReq(), 501, { status: 'APPROVED' });

		expect(mockCreateLiabilities).toHaveBeenCalledTimes(1);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});
});

describe('updatePaymentRequisition — reversal blocked once TDS is settled', () => {
	test('APPROVED -> REJECTED is blocked when cancelLiabilitiesForRequisition rejects', async () => {
		mockPaymentRequisitionFindOne.mockResolvedValue({ id: 501, org_id: 7 });
		mockPrFindById.mockResolvedValue({
			id: 501,
			org_id: 7,
			po_id: 200,
			wo_id: null,
			gross_amount: 100000,
			total_deductions: 2000,
			net_payable: 98000,
			status: 'APPROVED',
			requisition_type: 'REGULAR',
			requisition_against: 'PO',
			authorized_by_id: 1,
			deductions: [],
		});
		mockCancelLiabilities.mockRejectedValue(new Error('already been settled with the government'));

		await expect(prService.updatePaymentRequisition(baseReq(), 501, { status: 'REJECTED' })).rejects.toThrow(/already been settled/);

		expect(mockTransaction.rollback).toHaveBeenCalled();
	});
});

describe('updatePaymentRequisition — deductions frozen once a TDS liability exists', () => {
	test('bulk-replacing deductions is rejected when the requisition already has a liability', async () => {
		mockPaymentRequisitionFindOne.mockResolvedValue({ id: 501, org_id: 7 });
		mockPrFindById.mockResolvedValue({
			id: 501,
			org_id: 7,
			po_id: 200,
			gross_amount: 100000,
			total_deductions: 2000,
			net_payable: 98000,
			status: 'APPROVED',
			requisition_type: 'REGULAR',
			requisition_against: 'PO',
			deductions: [],
		});
		mockTdsLiabilityCount.mockResolvedValue(1);

		await expect(
			prService.updatePaymentRequisition(baseReq(), 501, { deductions: [{ deduction_type: 'TDS', amount: 3000 }] }),
		).rejects.toThrow(/TDS liabilities on record/);

		expect(mockTransaction.rollback).toHaveBeenCalled();
	});
});

describe('addDeduction — retention cap is enforced here too', () => {
	test('rejects a RETENTION line added directly via addDeduction once it would exceed the cap', async () => {
		mockPrFindById.mockResolvedValue({
			id: 501,
			org_id: 7,
			po_id: 200,
			wo_id: null,
			gross_amount: 100000,
			net_payable: 95000,
			status: 'PENDING',
			requisition_type: 'REGULAR',
		});
		mockPurchaseOrderFindByPk.mockResolvedValue({ retention_amount: 5000 });
		mockGetRetentionSummaryForPo.mockResolvedValue({ retention_held: 4500, retention_released: 0, retention_balance: 4500 });

		await expect(
			prService.addDeduction(baseReq(), 501, { deduction_type: 'RETENTION', amount: 1000 }),
		).rejects.toThrow(/Retention cap exceeded/);

		expect(mockTransaction.rollback).toHaveBeenCalled();
	});
});

// A PO worth 100000, of which only 60000 worth has actually been received
// (via MRN) — the exact scenario a short-close or partial delivery produces.
// PR must cap itself at what arrived, not at the PO's full ordered value.
describe('createPaymentRequisition — receipt-value cap', () => {
	test('rejects a PO-direct requisition once gross exceeds received value', async () => {
		mockPurchaseOrderFindByPk.mockResolvedValue({ grandTotal: 100000 });
		mockSequelizeQuery.mockResolvedValue([{ price: 100, received_qty: 600 }]); // 60000 received

		await expect(
			prService.createPaymentRequisition(baseReq(), {
				requisitionAgainst: 'PO',
				poWoId: 200,
				grossAmount: 70000,
			}),
		).rejects.toThrow(/only ₹60000\.00 remains against received value/);

		expect(mockTransaction.rollback).toHaveBeenCalled();
	});

	test('allows a PO-direct requisition exactly at the received-value cap', async () => {
		mockPurchaseOrderFindByPk.mockResolvedValue({ grandTotal: 100000 });
		mockSequelizeQuery.mockResolvedValue([{ price: 100, received_qty: 600 }]); // 60000 received

		await expect(
			prService.createPaymentRequisition(baseReq(), {
				requisitionAgainst: 'PO',
				poWoId: 200,
				grossAmount: 60000,
			}),
		).resolves.toBeDefined();

		expect(mockTransaction.rollback).not.toHaveBeenCalled();
	});

	test('does not apply the receipt-value cap to a WO-direct requisition', async () => {
		await expect(
			prService.createPaymentRequisition(baseReq(), {
				requisitionAgainst: 'WO',
				poWoId: 300,
				grossAmount: 999999999,
			}),
		).resolves.toBeDefined();

		// No MRN/received-value lookup should ever run for the WO path — it has
		// no MRN-equivalent receipt ledger to cap against.
		expect(mockSequelizeQuery).not.toHaveBeenCalled();
		expect(mockTransaction.rollback).not.toHaveBeenCalled();
	});
});

describe('getPoWoSummary — receipt-value cap', () => {
	test('caps remainingAmount at received value for a PO, not the full grandTotal', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue({ total_taxable: 90000, grandTotal: 100000 });
		mockSequelizeQuery.mockResolvedValue([{ price: 100, received_qty: 600 }]); // 60000 received
		mockGetPoWoFinancialSummary.mockResolvedValue({ total_gross: 0 });

		const summary = await prService.getPoWoSummary(baseReq(), 'PO', 200);

		expect(summary.receivedValue).toBe(60000);
		expect(summary.payableCap).toBe(60000);
		expect(summary.remainingAmount).toBe(60000);
		expect(summary.poWoExpInvAmount).toBe(100000); // display figure stays the PO's real value
	});

	test('does not cap remainingAmount for a WO — no MRN-equivalent receipt ledger exists', async () => {
		WorkOrder.findOne.mockResolvedValue({ total_taxable: 90000, grandTotal: 100000 });
		mockGetPoWoFinancialSummary.mockResolvedValue({ total_gross: 0 });

		const summary = await prService.getPoWoSummary(baseReq(), 'WO', 300);

		expect(summary.receivedValue).toBeNull();
		expect(summary.remainingAmount).toBe(100000);
		expect(mockSequelizeQuery).not.toHaveBeenCalled();
	});
});

describe('regression: syncPoWoPaymentFields caps remainingAmount at received value, not grandTotal', () => {
	test('approving a PR for the full received value brings a partially-received PO to PAID/0-remaining, not stuck showing the unreceived balance as still owed', async () => {
		mockPaymentRequisitionFindOne.mockResolvedValue({ id: 501, org_id: 7 });
		mockPrFindById.mockResolvedValue({
			id: 501,
			org_id: 7,
			po_id: 200,
			wo_id: null,
			gross_amount: 60000,
			total_deductions: 0,
			net_payable: 60000,
			status: 'PENDING',
			requisition_type: 'REGULAR',
			requisition_against: 'PO',
			authorized_by_id: null,
			deductions: [],
		});
		// PO ordered for 100000, but only 60000 worth ever arrived (short-close /
		// partial delivery) — this is the exact value syncPoWoPaymentFields must
		// treat as the ceiling once totalPaid reaches it.
		mockPurchaseOrderFindOne.mockResolvedValue({ grandTotal: 100000, totalPaid: 0 });
		mockSequelizeQuery.mockResolvedValue([{ price: 100, received_qty: 600 }]); // 60000 received

		await prService.updatePaymentRequisition(baseReq(), 501, { status: 'APPROVED', grossAmount: 60000 });

		expect(mockPurchaseOrderUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ totalPaid: 60000, remainingAmount: 0, paymentStatus: 'PAID' }),
			expect.anything(),
		);
	});
});

describe('createPaymentRequisition — PO-direct closes once a Purchase Invoice exists', () => {
	it('rejects a PO-direct requisition once an active invoice exists for the PO', async () => {
		mockPurchaseInvoiceCount.mockResolvedValue(1); // an active invoice already exists

		await expect(
			prService.createPaymentRequisition(baseReq(), {
				requisitionAgainst: 'PO',
				poWoId: 200,
				grossAmount: 10000,
			}),
		).rejects.toThrow(/raise the requisition against the Invoice instead/);

		expect(mockTransaction.rollback).toHaveBeenCalled();
	});
});

describe('createPaymentRequisition — Invoice path', () => {
	function approvedInvoice(overrides = {}) {
		return { id: 900, org_id: 7, status: 'approved', grandTotal: 60000, purchase_order_id: 50, ...overrides };
	}

	it('rejects when the invoice is not approved yet', async () => {
		mockPurchaseInvoiceFindOne.mockResolvedValue(approvedInvoice({ status: 'in_progress' }));

		await expect(
			prService.createPaymentRequisition(baseReq(), {
				requisitionAgainst: 'Invoice',
				poWoId: 900,
				grossAmount: 60000,
			}),
		).rejects.toThrow(/not approved/);
	});

	it('rejects a second requisition against an invoice that already has a non-rejected PR (1:1)', async () => {
		mockPurchaseInvoiceFindOne.mockResolvedValue(approvedInvoice());
		mockPaymentRequisitionCount.mockResolvedValue(1);

		await expect(
			prService.createPaymentRequisition(baseReq(), {
				requisitionAgainst: 'Invoice',
				poWoId: 900,
				grossAmount: 60000,
			}),
		).rejects.toThrow(/already exists for this Purchase Invoice/);
	});

	it('rejects gross exceeding the invoice\'s own grandTotal', async () => {
		mockPurchaseInvoiceFindOne.mockResolvedValue(approvedInvoice({ grandTotal: 60000 }));
		mockPaymentRequisitionCount.mockResolvedValue(0);

		await expect(
			prService.createPaymentRequisition(baseReq(), {
				requisitionAgainst: 'Invoice',
				poWoId: 900,
				grossAmount: 70000,
			}),
		).rejects.toThrow(/exceeds this invoice's value/);
	});

	it('creates successfully and syncs the underlying PO (not a parallel ledger) when approved', async () => {
		mockPurchaseInvoiceFindOne.mockResolvedValue(approvedInvoice());
		mockPaymentRequisitionCount.mockResolvedValue(0);
		mockPurchaseInvoiceFindByPk.mockResolvedValue({ purchase_order_id: 50 });
		mockPurchaseOrderFindOne.mockResolvedValue({ grandTotal: 100000, totalPaid: 0 });
		mockPrFindById.mockResolvedValue({ id: 501, org_id: 7, purchase_invoice_id: 900, gross_amount: 60000, net_payable: 60000, status: 'APPROVED', deductions: [] });

		await prService.createPaymentRequisition(baseReq(), {
			requisitionAgainst: 'Invoice',
			poWoId: 900,
			grossAmount: 60000,
			status: 'APPROVED',
		});

		expect(mockPrCreate).toHaveBeenCalledWith(
			expect.objectContaining({ purchase_invoice_id: 900, po_id: null, wo_id: null }),
			expect.anything(),
		);
		// Sync resolves through the invoice's own purchase_order_id, landing on
		// the PO's totalPaid — not a separate per-invoice counter.
		expect(mockPurchaseOrderUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ totalPaid: 60000 }),
			expect.anything(),
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});
});

describe('getPoWoSummary — Invoice type and the PO-direct-closes gate', () => {
	it('type=PO returns requiresInvoice once an active invoice exists, remainingAmount 0', async () => {
		mockPurchaseOrderFindOne.mockResolvedValue({ total_taxable: 90000, grandTotal: 100000 });
		mockPurchaseInvoiceCount.mockResolvedValue(1);

		const summary = await prService.getPoWoSummary(baseReq(), 'PO', 50);

		expect(summary.requiresInvoice).toBe(true);
		expect(summary.remainingAmount).toBe(0);
	});

	it('type=INVOICE returns the full grandTotal as remaining before any PR exists', async () => {
		mockPurchaseInvoiceFindOne.mockResolvedValue({ total_taxable: 54000, grandTotal: 60000, purchase_order_id: 50 });
		mockPaymentRequisitionCount.mockResolvedValue(0);

		const summary = await prService.getPoWoSummary(baseReq(), 'Invoice', 900);

		expect(summary.remainingAmount).toBe(60000);
		expect(summary.poWoExpInvAmount).toBe(60000);
	});

	it('type=INVOICE returns 0 remaining once a non-rejected PR exists (1:1)', async () => {
		mockPurchaseInvoiceFindOne.mockResolvedValue({ total_taxable: 54000, grandTotal: 60000, purchase_order_id: 50 });
		mockPaymentRequisitionCount.mockResolvedValue(1);

		const summary = await prService.getPoWoSummary(baseReq(), 'Invoice', 900);

		expect(summary.remainingAmount).toBe(0);
	});
});
