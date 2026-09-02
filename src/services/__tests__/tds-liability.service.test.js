'use strict';

const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { UPDATE: 'UPDATE' } };

const mockTdsLiabilityFindAll = jest.fn();
const mockPurchaseOrderFindOne = jest.fn().mockResolvedValue(null);
jest.mock('../../models/index', () => ({
	TdsLiability: { findAll: (...args) => mockTdsLiabilityFindAll(...args), count: jest.fn() },
	PurchaseOrder: { findOne: (...args) => mockPurchaseOrderFindOne(...args) },
	WorkOrder: { findOne: jest.fn().mockResolvedValue(null) },
}));

const mockFindByRequisitionId = jest.fn();
jest.mock('../../repository/payment-requisition-deduction.repository', () => ({
	findByRequisitionId: (...args) => mockFindByRequisitionId(...args),
}));

const mockFindByDeductionId = jest.fn();
const mockLiabilityCreate = jest.fn();
jest.mock('../../repository/tds-liability.repository', () => ({
	findByDeductionId: (...args) => mockFindByDeductionId(...args),
	create: (...args) => mockLiabilityCreate(...args),
	findAll: jest.fn(),
	findById: jest.fn(),
	buildFilterWhere: jest.fn((x) => x),
	getSummary: jest.fn(),
}));

jest.mock('../auditLog.service', () => ({ record: jest.fn().mockResolvedValue(undefined) }));

const { TdsLiability } = require('../../models/index');
const tdsLiabilityService = require('../tds-liability.service');

function baseReq(overrides = {}) {
	return { user: { id: 1, org_id: 7, name: 'Finance User', email: 'f@x.com' }, ...overrides };
}

function requisition(overrides = {}) {
	return {
		id: 55,
		org_id: 7,
		po_id: 200,
		wo_id: null,
		supplier_id: 9,
		supplier_snapshot: { vendor_name: 'Acme' },
		gross_amount: 100000,
		payment_date: null,
		requisition_date: '2026-08-20',
		...overrides,
	};
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe('createLiabilitiesForApprovedRequisition', () => {
	test('creates one liability per TDS-type deduction line and ignores others', async () => {
		mockFindByRequisitionId.mockResolvedValue([
			{ id: 10, deduction_type: 'TDS', amount: 2000, percentage: 2 },
			{ id: 11, deduction_type: 'RETENTION', amount: 5000 },
			{ id: 12, deduction_type: 'WCT', amount: 500 },
		]);
		mockFindByDeductionId.mockResolvedValue(null);
		mockLiabilityCreate.mockImplementation((data) => Promise.resolve({ id: Math.random(), ...data }));

		const created = await tdsLiabilityService.createLiabilitiesForApprovedRequisition(baseReq(), requisition(), mockTransaction);

		expect(created).toHaveLength(2);
		expect(mockLiabilityCreate).toHaveBeenCalledWith(
			expect.objectContaining({ deduction_type: 'TDS', tds_amount: 2000, payment_requisition_deduction_id: 10, source_type: 'PO', po_id: 200 }),
			{ transaction: mockTransaction },
		);
		expect(mockLiabilityCreate).toHaveBeenCalledWith(
			expect.objectContaining({ deduction_type: 'WCT', tds_amount: 500, payment_requisition_deduction_id: 12 }),
			{ transaction: mockTransaction },
		);
	});

	test('base_amount for TDS uses the taxable (pre-GST) slice of gross; WCT keeps gross as its base', async () => {
		// PO: taxable 36000, GST 4320, grandTotal 40320 — gross_amount here (20160)
		// is 50% of the order, so the taxable slice is 18000.
		mockPurchaseOrderFindOne.mockResolvedValue({ total_taxable: 36000, grandTotal: 40320 });
		mockFindByRequisitionId.mockResolvedValue([
			{ id: 10, deduction_type: 'TDS', amount: 900, percentage: 5 },
			{ id: 12, deduction_type: 'WCT', amount: 1000, percentage: 5 },
		]);
		mockFindByDeductionId.mockResolvedValue(null);
		mockLiabilityCreate.mockImplementation((data) => Promise.resolve({ id: Math.random(), ...data }));

		await tdsLiabilityService.createLiabilitiesForApprovedRequisition(baseReq(), requisition({ gross_amount: 20160 }), mockTransaction);

		expect(mockLiabilityCreate).toHaveBeenCalledWith(
			expect.objectContaining({ deduction_type: 'TDS', base_amount: 18000 }),
			{ transaction: mockTransaction },
		);
		expect(mockLiabilityCreate).toHaveBeenCalledWith(
			expect.objectContaining({ deduction_type: 'WCT', base_amount: 20160 }),
			{ transaction: mockTransaction },
		);
	});

	test('is idempotent — skips a deduction that already has a liability', async () => {
		mockFindByRequisitionId.mockResolvedValue([{ id: 10, deduction_type: 'TDS', amount: 2000, percentage: 2 }]);
		mockFindByDeductionId.mockResolvedValue({ id: 999 }); // already exists

		const created = await tdsLiabilityService.createLiabilitiesForApprovedRequisition(baseReq(), requisition(), mockTransaction);

		expect(created).toHaveLength(0);
		expect(mockLiabilityCreate).not.toHaveBeenCalled();
	});

	test('creates nothing when there are no TDS-type deductions', async () => {
		mockFindByRequisitionId.mockResolvedValue([{ id: 11, deduction_type: 'RETENTION', amount: 5000 }]);

		const created = await tdsLiabilityService.createLiabilitiesForApprovedRequisition(baseReq(), requisition(), mockTransaction);

		expect(created).toHaveLength(0);
		expect(mockLiabilityCreate).not.toHaveBeenCalled();
	});
});

describe('cancelLiabilitiesForRequisition', () => {
	test('blocks cancellation once any liability has been settled', async () => {
		mockTdsLiabilityFindAll.mockResolvedValue([
			{ id: 1, amount_settled: 0, update: jest.fn() },
			{ id: 2, amount_settled: 300, update: jest.fn() },
		]);

		await expect(
			tdsLiabilityService.cancelLiabilitiesForRequisition(baseReq(), 55, 'reversed', mockTransaction),
		).rejects.toThrow(/already been settled/);
	});

	test('cancels every unsettled liability when none has been settled', async () => {
		const liability1 = { id: 1, amount_settled: 0, update: jest.fn().mockResolvedValue(true) };
		const liability2 = { id: 2, amount_settled: 0, update: jest.fn().mockResolvedValue(true) };
		mockTdsLiabilityFindAll.mockResolvedValue([liability1, liability2]);

		await tdsLiabilityService.cancelLiabilitiesForRequisition(baseReq(), 55, 'requisition rejected', mockTransaction);

		expect(liability1.update).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'CANCELLED', cancellation_reason: 'requisition rejected' }),
			{ transaction: mockTransaction },
		);
		expect(liability2.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'CANCELLED' }), { transaction: mockTransaction });
	});
});
