const { sequelize } = require('../models/index');
const settlementRepo = require('../repository/tds-settlement.repository');
const liabilityRepo = require('../repository/tds-liability.repository');
const auditLogService = require('./auditLog.service');
const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const logger = require('../utils/logger');
const money = require('../utils/money');

function statusFromRemaining(tdsAmount, amountSettled) {
	if (money.lte(tdsAmount, amountSettled)) return 'PAID';
	if (money.gt(amountSettled, 0)) return 'PARTIALLY_PAID';
	return 'UNPAID';
}

/**
 * Records a government TDS payment/challan that settles one or more
 * TdsLiabilities, possibly only partially each. Every liability row involved
 * is locked (SELECT ... FOR UPDATE) before its remaining balance is checked,
 * so two concurrent settlements against the same liability can't both
 * over-allocate it.
 *
 * Payload: { settlement_date, challan_number, payment_mode, bank_reference,
 *            remarks, allocations: [{ tds_liability_id, allocated_amount }] }
 */
exports.createTdsSettlement = async (req, payload) => {
	const { org_id } = req.user;
	const { settlement_date, challan_number, payment_mode, bank_reference, remarks, allocations = [] } = payload;

	if (!settlement_date) {
		throw new AppError('settlement_date is required', StatusCodes.UNPROCESSABLE_ENTITY);
	}
	if (!Array.isArray(allocations) || allocations.length === 0) {
		throw new AppError('At least one allocation is required', StatusCodes.UNPROCESSABLE_ENTITY);
	}

	const transaction = await sequelize.transaction();
	try {
		let totalAmount = 0;
		const lockedLiabilities = [];

		for (const alloc of allocations) {
			const allocatedAmount = parseFloat(alloc.allocated_amount);
			if (!allocatedAmount || allocatedAmount <= 0) {
				throw new AppError('Each allocation must have a positive allocated_amount', StatusCodes.UNPROCESSABLE_ENTITY);
			}

			const liability = await liabilityRepo.findByIdForUpdate(alloc.tds_liability_id, transaction);
			if (!liability || liability.org_id !== org_id) {
				throw new AppError(`TDS liability ${alloc.tds_liability_id} not found`, StatusCodes.NOT_FOUND);
			}
			if (liability.status === 'CANCELLED') {
				throw new AppError(`TDS liability ${liability.id} was cancelled and cannot be settled`, StatusCodes.CONFLICT);
			}

			const remaining = money.round2(parseFloat(liability.tds_amount) - parseFloat(liability.amount_settled));
			if (money.gt(allocatedAmount, remaining)) {
				throw new AppError(
					`Allocation of ₹${allocatedAmount.toFixed(2)} exceeds outstanding liability ₹${remaining.toFixed(2)} for TDS liability ${liability.id}`,
					StatusCodes.UNPROCESSABLE_ENTITY,
				);
			}

			totalAmount = money.sum([totalAmount, allocatedAmount]);
			lockedLiabilities.push({ liability, allocatedAmount });
		}

		const settlement = await settlementRepo.create(
			{
				org_id,
				settlement_date,
				challan_number: challan_number || null,
				total_amount: totalAmount,
				payment_mode: payment_mode || null,
				bank_reference: bank_reference || null,
				remarks: remarks || null,
				status: 'ACTIVE',
				created_by_id: req.user.id,
			},
			{ transaction },
		);

		await settlementRepo.createAllocations(
			lockedLiabilities.map(({ liability, allocatedAmount }) => ({
				tds_settlement_id: settlement.id,
				tds_liability_id: liability.id,
				allocated_amount: allocatedAmount,
			})),
			{ transaction },
		);

		for (const { liability, allocatedAmount } of lockedLiabilities) {
			const newAmountSettled = money.sum([parseFloat(liability.amount_settled), allocatedAmount]);
			const newStatus = statusFromRemaining(parseFloat(liability.tds_amount), newAmountSettled);
			await liability.update(
				{ amount_settled: newAmountSettled, status: newStatus, updated_by_id: req.user.id },
				{ transaction },
			);
		}

		await auditLogService.record({
			req,
			entityType: 'tds_settlement',
			entityId: settlement.id,
			action: 'create',
			newState: { total_amount: totalAmount, challan_number, liability_count: lockedLiabilities.length },
			transaction,
		});

		await transaction.commit();
		logger.info('TDS settlement created', { id: settlement.id, org_id, totalAmount });
		return settlementRepo.findById(settlement.id);
	} catch (error) {
		await transaction.rollback();
		logger.error('Failed to create TDS settlement', { error: error.message, org_id });
		throw error;
	}
};

exports.getAllTdsSettlements = async (req) => {
	const { org_id } = req.user;
	const { fromDate, toDate, status, limit, offset } = req.query;
	const { Op } = require('sequelize');
	const where = { org_id };
	if (fromDate && toDate) where.settlement_date = { [Op.gte]: fromDate, [Op.lte]: toDate };
	if (status && status !== 'all') where.status = status;
	return settlementRepo.findAll(where, { limit, offset });
};

exports.getTdsSettlementById = async (req, id) => {
	const { org_id } = req.user;
	const settlement = await settlementRepo.findById(id);
	if (!settlement || settlement.org_id !== org_id) {
		throw new AppError('TDS settlement not found', StatusCodes.NOT_FOUND);
	}
	return settlement;
};

/**
 * Reverses a settlement rather than deleting it — the row and its allocations
 * stay in place for audit, but status flips to REVERSED and every liability it
 * touched has its amount_settled/status recomputed as if this settlement never
 * happened (excluding REVERSED settlements from the recompute).
 */
exports.reverseTdsSettlement = async (req, id, reason) => {
	const { org_id } = req.user;

	if (!reason) {
		throw new AppError('A reversal reason is required', StatusCodes.UNPROCESSABLE_ENTITY);
	}

	const transaction = await sequelize.transaction();
	try {
		const settlement = await settlementRepo.findByIdForUpdate(id, transaction);
		if (!settlement || settlement.org_id !== org_id) {
			throw new AppError('TDS settlement not found', StatusCodes.NOT_FOUND);
		}
		if (settlement.status === 'REVERSED') {
			throw new AppError('This settlement has already been reversed', StatusCodes.CONFLICT);
		}

		const allocations = await settlementRepo.findAllocationsBySettlementId(id, { transaction });

		for (const alloc of allocations) {
			const liability = await liabilityRepo.findByIdForUpdate(alloc.tds_liability_id, transaction);
			if (!liability) continue;

			const newAmountSettled = money.round2(Math.max(0, parseFloat(liability.amount_settled) - parseFloat(alloc.allocated_amount)));
			const newStatus = statusFromRemaining(parseFloat(liability.tds_amount), newAmountSettled);
			await liability.update({ amount_settled: newAmountSettled, status: newStatus, updated_by_id: req.user.id }, { transaction });
		}

		await settlement.update(
			{ status: 'REVERSED', reversed_at: new Date(), reversed_by_id: req.user.id, reversal_reason: reason },
			{ transaction },
		);

		await auditLogService.record({
			req,
			entityType: 'tds_settlement',
			entityId: settlement.id,
			action: 'reverse',
			previousState: { status: 'ACTIVE' },
			newState: { status: 'REVERSED', reason },
			transaction,
		});

		await transaction.commit();
		logger.info('TDS settlement reversed', { id, org_id });
		return settlementRepo.findById(id);
	} catch (error) {
		await transaction.rollback();
		throw error;
	}
};
