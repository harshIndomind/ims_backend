const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterMajorHeadAmountRepo } = require('../repository/index');
const logger = require('../utils/logger');
const {
	MasterMajorHead,
	MasterPeriod,
	MasterSubHeadAmount,
	organization,
} = require('../models/index');
const auditLogService = require('./auditLog.service');
const { fn, col } = require('sequelize');

const ENTITY_TYPE = 'major_head_amount';
/**
 * Create
 */
exports.createMasterMajorHeadAmount = async (req, payload) => {
	const { org_id } = req.user;
	const { major_head_id, period_id, amount } = payload;

	if (!major_head_id || !period_id || !amount) {
		logger.warn(
			'Validation failed while creating Master Major Head Amount',
			payload,
		);
		throw new AppError(
			'Major head id, period id and amount are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const existing = await masterMajorHeadAmountRepo.getAmountByMajorHeadAndPeriod({
		where: { org_id, major_head_id, period_id },
	});
	if (existing) {
		throw new AppError(
			'A major head amount already exists for this major head and period',
			StatusCodes.CONFLICT,
		);
	}

	const majorHeadAmount = await masterMajorHeadAmountRepo.create({
		org_id,
		major_head_id,
		period_id,
		amount,
	});

	logger.info('Master Major Head created', {
		id: majorHeadAmount.id,
		major_head_id: majorHeadAmount.major_head_id,
		period_id: majorHeadAmount.period_id,
		amount: majorHeadAmount.amount,
	});

	await auditLogService.record({
		req,
		entityType: ENTITY_TYPE,
		entityId: majorHeadAmount.id,
		action: 'create',
		newState: majorHeadAmount.toJSON(),
	});

	return majorHeadAmount;
};

/**
 * Update
 */
exports.updateMasterMajorHeadAmount = async (req, id, payload) => {
	const { major_head_id, period_id, amount } = payload;

	const masterMajorHeadAmount = await masterMajorHeadAmountRepo.findById(id);

	if (!masterMajorHeadAmount) {
		logger.warn('Master Major Head amount not found for update', { id });
		throw new AppError(
			'Master Major Head amount not found',
			StatusCodes.NOT_FOUND,
		);
	}

	const subHeadCount = await MasterSubHeadAmount.count({
		where: { major_head_amount_id: id },
	});
	if (subHeadCount > 0) {
		throw new AppError(
			'Amount cannot be edited — sub-heads have already been allocated from this major head amount',
			StatusCodes.UNPROCESSABLE_ENTITY,
		);
	}

	const before = masterMajorHeadAmount.toJSON();

	await masterMajorHeadAmountRepo.update(masterMajorHeadAmount, {
		major_head_id,
		period_id,
		amount,
	});

	logger.info('Master Major Head amount updated', {
		id,
	});

	await auditLogService.recordChange({
		req,
		entityType: ENTITY_TYPE,
		entityId: masterMajorHeadAmount.id,
		action: 'update',
		before,
		after: masterMajorHeadAmount.toJSON(),
	});

	return masterMajorHeadAmount;
};

/**
 * Get All
 */
exports.getAllMasterMajorHeadAmount = async (req) => {
	const { org_id } = req.user;
	const { limit, offset } = req.query;

	const options = {};
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset);
	}
	logger.info('Fetching all Master Major Head Amounts');
	const result = await masterMajorHeadAmountRepo.findAll({
		where: { org_id },
		...options,
		attributes: {
			include: [
				[fn('SUM', col('subHeadAmount.amount')), 'total_sub_head_amount'],
			],
		},
		include: [
			{
				model: MasterMajorHead,
				as: 'majorHead',
				attributes: ['m_code', 'm_name'],
			},
			{
				model: MasterPeriod,
				as: 'period',
				attributes: ['period', 'period_detail', 'period_short'],
			},
			{
				model: organization,
				as: 'organization',
				attributes: ['org_code', 'org_name'],
			},
			{
				model: MasterSubHeadAmount,
				as: 'subHeadAmount',
				attributes: [],
			},
		],
		group: ['MasterMajorHeadAmount.id', 'majorHead.id', 'period.id', 'organization.id'],
		subQuery: false,
	});
	// Sequelize returns count as an array when GROUP BY is used; normalize to a number
	const count = Array.isArray(result.count) ? result.count.length : result.count;
	return { count, rows: result.rows };
};

/**
 * Get By ID
 */
exports.getMasterMajorHeadAmountById = async (id) => {
	const masterMajorHeadAmount = await masterMajorHeadAmountRepo.findById(id, {
		attributes: {
			include: [
				[fn('SUM', col('subHeadAmount.amount')), 'total_sub_head_amount'],
			],
		},
		include: [
			{
				model: MasterSubHeadAmount,
				as: 'subHeadAmount',
				attributes: [], // IMPORTANT: avoid row duplication
			},
		],
		group: ['MasterMajorHeadAmount.id'],
	});

	if (!masterMajorHeadAmount) {
		logger.warn('Master Major Head Amount not found', { id });
		throw new AppError(
			'Master Major Head Amount not found',
			StatusCodes.NOT_FOUND,
		);
	}

	logger.info('Master Major Head Amount fetched', { id });

	return masterMajorHeadAmount;
};

/**
 * Delete
 */
exports.deleteMasterMajorHeadAmount = async (req, id) => {
	const masterMajorHeadAmount = await masterMajorHeadAmountRepo.findById(id);

	if (!masterMajorHeadAmount) {
		logger.warn('Master Major Head Amount not found for delete', { id });
		throw new AppError(
			'Master Major Head Amount not found',
			StatusCodes.NOT_FOUND,
		);
	}

	// MasterSubHeadAmounts.major_head_amount_id is ON DELETE CASCADE, and Budgets'
	// sub_head_amount_id is in turn ON DELETE CASCADE off MasterSubHeadAmounts — so
	// deleting this row unguarded would silently wipe out sub-head allocations and any
	// budgets already created against them. Block it the same way update is blocked.
	const subHeadCount = await MasterSubHeadAmount.count({
		where: { major_head_amount_id: id },
	});
	if (subHeadCount > 0) {
		throw new AppError(
			'Cannot delete — sub-heads have already been allocated from this major head amount',
			StatusCodes.UNPROCESSABLE_ENTITY,
		);
	}

	const before = masterMajorHeadAmount.toJSON();

	await masterMajorHeadAmountRepo.delete(masterMajorHeadAmount);

	logger.info('Master Major Head Amount deleted', { id });

	await auditLogService.record({
		req,
		entityType: ENTITY_TYPE,
		entityId: Number(id),
		action: 'delete',
		previousState: before,
	});

	return true;
};

exports.getAmountByMajorHeadAndPeriod = async (
	org_id,
	major_head_id,
	period_id,
) => {
	logger.info('Fetching all Master Major Head Amounts');
	return await masterMajorHeadAmountRepo.getAmountByMajorHeadAndPeriod({
		where: { org_id, major_head_id, period_id },
		include: [
			{
				model: MasterMajorHead,
				as: 'majorHead',
				attributes: ['m_code', 'm_name'],
			},
			{
				model: MasterPeriod,
				as: 'period',
				attributes: ['period', 'period_detail', 'period_short'],
			},
		],
	});
};
