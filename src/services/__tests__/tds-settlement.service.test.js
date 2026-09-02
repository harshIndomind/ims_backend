'use strict';

const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { UPDATE: 'UPDATE' } };

jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
}));

const mockFindByIdForUpdate = jest.fn();
const mockLiabilityFindById = jest.fn();
jest.mock('../../repository/tds-liability.repository', () => ({
	findByIdForUpdate: (...args) => mockFindByIdForUpdate(...args),
	findById: (...args) => mockLiabilityFindById(...args),
}));

const mockSettlementCreate = jest.fn();
const mockCreateAllocations = jest.fn();
const mockSettlementFindById = jest.fn();
const mockSettlementFindByIdForUpdate = jest.fn();
const mockFindAllocationsBySettlementId = jest.fn();
jest.mock('../../repository/tds-settlement.repository', () => ({
	create: (...args) => mockSettlementCreate(...args),
	createAllocations: (...args) => mockCreateAllocations(...args),
	findById: (...args) => mockSettlementFindById(...args),
	findByIdForUpdate: (...args) => mockSettlementFindByIdForUpdate(...args),
	findAllocationsBySettlementId: (...args) => mockFindAllocationsBySettlementId(...args),
	findAll: jest.fn(),
	updateById: jest.fn(),
}));

jest.mock('../auditLog.service', () => ({ record: jest.fn().mockResolvedValue(undefined) }));

const { sequelize } = require('../../models/index');
const tdsSettlementService = require('../tds-settlement.service');

function baseReq(overrides = {}) {
	return { user: { id: 1, org_id: 7, name: 'Finance User', email: 'f@x.com' }, ...overrides };
}

function makeLiability(overrides = {}) {
	return {
		id: 1,
		org_id: 7,
		status: 'UNPAID',
		tds_amount: 1000,
		amount_settled: 0,
		update: jest.fn().mockResolvedValue(true),
		...overrides,
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	sequelize.transaction.mockResolvedValue(mockTransaction);
	mockSettlementCreate.mockResolvedValue({ id: 101 });
	mockCreateAllocations.mockResolvedValue([]);
	mockSettlementFindById.mockResolvedValue({ id: 101 });
});

describe('createTdsSettlement', () => {
	test('rejects a missing settlement_date', async () => {
		await expect(tdsSettlementService.createTdsSettlement(baseReq(), { allocations: [{ tds_liability_id: 1, allocated_amount: 100 }] })).rejects.toThrow(
			'settlement_date is required',
		);
	});

	test('rejects an empty allocations array', async () => {
		await expect(
			tdsSettlementService.createTdsSettlement(baseReq(), { settlement_date: '2026-08-20', allocations: [] }),
		).rejects.toThrow('At least one allocation is required');
	});

	test('fully settles a single liability and marks it PAID', async () => {
		const liability = makeLiability({ tds_amount: 1000, amount_settled: 0 });
		mockFindByIdForUpdate.mockResolvedValue(liability);

		await tdsSettlementService.createTdsSettlement(baseReq(), {
			settlement_date: '2026-08-20',
			challan_number: 'CH-001',
			allocations: [{ tds_liability_id: 1, allocated_amount: 1000 }],
		});

		expect(liability.update).toHaveBeenCalledWith(
			expect.objectContaining({ amount_settled: 1000, status: 'PAID' }),
			{ transaction: mockTransaction },
		);
		expect(mockSettlementCreate).toHaveBeenCalledWith(
			expect.objectContaining({ total_amount: 1000, challan_number: 'CH-001', status: 'ACTIVE' }),
			{ transaction: mockTransaction },
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	test('partially settles a liability and marks it PARTIALLY_PAID', async () => {
		const liability = makeLiability({ tds_amount: 1000, amount_settled: 0 });
		mockFindByIdForUpdate.mockResolvedValue(liability);

		await tdsSettlementService.createTdsSettlement(baseReq(), {
			settlement_date: '2026-08-20',
			allocations: [{ tds_liability_id: 1, allocated_amount: 400 }],
		});

		expect(liability.update).toHaveBeenCalledWith(
			expect.objectContaining({ amount_settled: 400, status: 'PARTIALLY_PAID' }),
			{ transaction: mockTransaction },
		);
	});

	test('rejects an allocation that exceeds the outstanding liability and rolls back', async () => {
		const liability = makeLiability({ tds_amount: 1000, amount_settled: 700 });
		mockFindByIdForUpdate.mockResolvedValue(liability);

		await expect(
			tdsSettlementService.createTdsSettlement(baseReq(), {
				settlement_date: '2026-08-20',
				allocations: [{ tds_liability_id: 1, allocated_amount: 400 }],
			}),
		).rejects.toThrow(/exceeds outstanding liability/);

		expect(mockTransaction.rollback).toHaveBeenCalled();
		expect(mockSettlementCreate).not.toHaveBeenCalled();
	});

	test('rejects settling a CANCELLED liability', async () => {
		const liability = makeLiability({ status: 'CANCELLED' });
		mockFindByIdForUpdate.mockResolvedValue(liability);

		await expect(
			tdsSettlementService.createTdsSettlement(baseReq(), {
				settlement_date: '2026-08-20',
				allocations: [{ tds_liability_id: 1, allocated_amount: 100 }],
			}),
		).rejects.toThrow(/cancelled/);
		expect(mockTransaction.rollback).toHaveBeenCalled();
	});

	test('a single challan can partially settle multiple liabilities at once', async () => {
		const liabilityA = makeLiability({ id: 1, tds_amount: 500, amount_settled: 0 });
		const liabilityB = makeLiability({ id: 2, tds_amount: 300, amount_settled: 0 });
		mockFindByIdForUpdate.mockImplementation((id) => Promise.resolve(id === 1 ? liabilityA : liabilityB));

		await tdsSettlementService.createTdsSettlement(baseReq(), {
			settlement_date: '2026-08-20',
			allocations: [
				{ tds_liability_id: 1, allocated_amount: 500 },
				{ tds_liability_id: 2, allocated_amount: 200 },
			],
		});

		expect(mockSettlementCreate).toHaveBeenCalledWith(expect.objectContaining({ total_amount: 700 }), expect.anything());
		expect(liabilityA.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'PAID' }), expect.anything());
		expect(liabilityB.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'PARTIALLY_PAID' }), expect.anything());
	});
});

describe('reverseTdsSettlement', () => {
	test('requires a reason', async () => {
		await expect(tdsSettlementService.reverseTdsSettlement(baseReq(), 101, undefined)).rejects.toThrow('reversal reason is required');
	});

	test('cannot reverse an already-reversed settlement', async () => {
		mockSettlementFindByIdForUpdate.mockResolvedValue({ id: 101, org_id: 7, status: 'REVERSED', update: jest.fn() });
		await expect(tdsSettlementService.reverseTdsSettlement(baseReq(), 101, 'mistake')).rejects.toThrow('already been reversed');
	});

	test('un-does its allocations and recomputes liability status back to PARTIALLY_PAID', async () => {
		const settlement = { id: 101, org_id: 7, status: 'ACTIVE', update: jest.fn().mockResolvedValue(true) };
		mockSettlementFindByIdForUpdate.mockResolvedValue(settlement);
		mockFindAllocationsBySettlementId.mockResolvedValue([{ tds_liability_id: 1, allocated_amount: 600 }]);

		const liability = makeLiability({ tds_amount: 1000, amount_settled: 1000, status: 'PAID' });
		mockFindByIdForUpdate.mockResolvedValue(liability);

		await tdsSettlementService.reverseTdsSettlement(baseReq(), 101, 'entered wrong challan');

		expect(liability.update).toHaveBeenCalledWith(
			expect.objectContaining({ amount_settled: 400, status: 'PARTIALLY_PAID' }),
			expect.anything(),
		);
		expect(settlement.update).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'REVERSED', reversal_reason: 'entered wrong challan' }),
			expect.anything(),
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});
});
