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
const mockTdsLiabilityCount = jest.fn().mockResolvedValue(0);

jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
	PaymentRequisition: { findOne: (...args) => mockPaymentRequisitionFindOne(...args) },
	PaymentRequisitionDeduction: {},
	PurchaseOrder: {
		findByPk: (...args) => mockPurchaseOrderFindByPk(...args),
		findOne: (...args) => mockPurchaseOrderFindOne(...args),
		update: (...args) => mockPurchaseOrderUpdate(...args),
		name: 'PurchaseOrder',
	},
	WorkOrder: { findByPk: jest.fn(), findOne: jest.fn(), update: jest.fn(), name: 'WorkOrder' },
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
jest.mock('../../repository/payment-requisition-analytics.repository', () => ({
	getRetentionSummary: (...args) => mockGetRetentionSummary(...args),
	getPoWoFinancialSummary: jest.fn(),
	getDeductionBreakdownByPoWo: jest.fn(),
	getFullLedgerByPoWo: jest.fn(),
}));

jest.mock('../../repository/tds-liability.repository', () => ({
	findByDeductionId: jest.fn(),
}));

const { sequelize } = require('../../models/index');
const prService = require('../payment-requisition.service');

function baseReq(overrides = {}) {
	return { user: { id: 1, org_id: 7, name: 'Finance User', email: 'f@x.com' }, ...overrides };
}

beforeEach(() => {
	jest.clearAllMocks();
	sequelize.transaction.mockResolvedValue(mockTransaction);
	mockPrCreate.mockResolvedValue({ id: 501, org_id: 7 });
	mockPrFindById.mockResolvedValue({ id: 501, org_id: 7, po_id: 200, gross_amount: 100000, net_payable: 90000, status: 'PENDING', deductions: [] });
});

describe('createPaymentRequisition — retention cap', () => {
	test('rejects a RETENTION deduction that would exceed the PO retention cap', async () => {
		mockPurchaseOrderFindByPk.mockResolvedValue({ retention_amount: 5000 });
		mockGetRetentionSummary.mockResolvedValue({ retention_held: 4000, retention_released: 0, retention_balance: 4000 });

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
		mockPurchaseOrderFindByPk.mockResolvedValue({ retention_amount: 5000 });
		mockGetRetentionSummary.mockResolvedValue({ retention_held: 1000, retention_released: 0, retention_balance: 1000 });

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
		mockPurchaseOrderFindByPk.mockResolvedValue({ retention_amount: 50000 });
		mockGetRetentionSummary.mockResolvedValue({ retention_held: 0, retention_released: 0, retention_balance: 0 });

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
		mockGetRetentionSummary.mockResolvedValue({ retention_held: 4500, retention_released: 0, retention_balance: 4500 });

		await expect(
			prService.addDeduction(baseReq(), 501, { deduction_type: 'RETENTION', amount: 1000 }),
		).rejects.toThrow(/Retention cap exceeded/);

		expect(mockTransaction.rollback).toHaveBeenCalled();
	});
});
