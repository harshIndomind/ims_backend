const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterMajorHeadAmountRepo } = require('../repository/index');
const logger = require('../utils/logger');
const { off } = require('pdfkit');
const {
	MasterMajorHead,
	MasterPeriod,
	MasterSubHeadAmount,
	organization,
} = require('../models/index');
const { fn, col } = require('sequelize');
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

	return majorHeadAmount;
};

/**
 * Update
 */
exports.updateMasterMajorHeadAmount = async (id, payload) => {
	const { major_head_id, period_id, amount } = payload;

	const masterMajorHeadAmount = await masterMajorHeadAmountRepo.findById(id);

	if (!masterMajorHeadAmount) {
		logger.warn('Master Major Head amount not found for update', { id });
		throw new AppError(
			'Master Major Head amount not found',
			StatusCodes.NOT_FOUND,
		);
	}

	await masterMajorHeadAmountRepo.update(masterMajorHeadAmount, {
		major_head_id,
		period_id,
		amount,
	});

	logger.info('Master Major Head amount updated', {
		id,
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
	return await masterMajorHeadAmountRepo.findAll({
		where: { org_id },
		...options,
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
		],
	});
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
exports.deleteMasterMajorHeadAmount = async (id) => {
	const masterMajorHeadAmount = await masterMajorHeadAmountRepo.findById(id);

	if (!masterMajorHeadAmount) {
		logger.warn('Master Major Head Amount not found for delete', { id });
		throw new AppError(
			'Master Major Head Amount not found',
			StatusCodes.NOT_FOUND,
		);
	}

	await masterMajorHeadAmountRepo.delete(masterMajorHeadAmount);

	logger.info('Master Major Head Amount deleted', { id });

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
