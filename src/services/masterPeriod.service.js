const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const {
	masterPeriodRepo,
	masterMajorHeadRepo,
} = require('../repository/index');
const logger = require('../utils/logger');
const { MasterMajorHead } = require('../models/index');
const { organization } = require('../models/index');

/**
 * Create
 */
exports.createMasterPeriod = async (req, payload) => {
	const { org_id } = req.user;
	const {
		period_code,
		period,
		period_detail,
		period_short,
		is_lock,
		from_date,
		end_date,
	} = payload;
	// const masterMajorHead = masterMajorHeadRepo.findById(major_code_id);

	// if (!masterMajorHead) {
	// 	logger.warn('Master major head not found', payload);
	// 	throw new AppError('Master major head not found', StatusCodes.BAD_REQUEST);
	// }

	if (!period_code || !period || !period_detail || !period_short) {
		logger.warn('Validation failed while creating Master Period', payload);
		throw new AppError(
			'period_code, period, period_detail and period_short are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const MasterPeriod = await masterPeriodRepo.create({
		org_id,
		period_code,
		period,
		period_detail,
		period_short,
		is_lock,
		from_date,
		end_date,
	});

	logger.info('Master Period created', {
		id: MasterPeriod.id,
		period_code: MasterPeriod.period_code,
		period: MasterPeriod.period,
		period_detail: MasterPeriod.period_detail,
		period_short: MasterPeriod.period_short,
		is_lock: MasterPeriod.is_lock,
		from_date: MasterPeriod.from_date,
		end_date: MasterPeriod.end_date,
	});

	return MasterPeriod;
};

/**
 * Update
 */
exports.updateMasterPeriod = async (id, payload) => {
	const {
		period_code,
		period,
		period_detail,
		period_short,
		is_lock,
		from_date,
		end_date,
	} = payload;

	const MasterPeriod = await masterPeriodRepo.findById(id);

	if (!MasterPeriod) {
		logger.warn('Master Period not found for update', { id });
		throw new AppError('Master Period not found', StatusCodes.NOT_FOUND);
	}

	// const masterMajorHead = masterMajorHeadRepo.findById(major_code_id);

	// if (!masterMajorHead) {
	// 	logger.warn('Master major head not found', payload);
	// 	throw new AppError('Master major head not found', StatusCodes.BAD_REQUEST);
	// }

	if (!period_code || !period || !period_detail || !period_short) {
		logger.warn('Validation failed while creating Master Period', payload);
		throw new AppError(
			'period_code, period, period_detail and period_short are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	await masterPeriodRepo.update(MasterPeriod, {
		period_code,
		period,
		period_detail,
		period_short,
		is_lock,
		from_date,
		end_date,
	});

	logger.info('Master Period updated', {
		id,
	});

	return MasterPeriod;
};

/**
 * Get All
 */
exports.getAllMasterPeriod = async (req) => {
	const { org_id } = req.user;
	const { limit, offset, is_lock } = req.query;

	const where = { org_id };

	if (is_lock !== undefined) {
		where.is_lock = is_lock;
	}

	const options = {};
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset);
	}
	logger.info('Fetching all Master Periods');
	options.include = [
		{
			model: organization,
			as: 'organization',
			attributes: ['org_code', 'org_name'],
		},
	];
	return await masterPeriodRepo.findAll({
		where,
		...options,
	});
};

/**
 * Get By ID
 */
exports.getMasterPeriodById = async (id) => {
	const MasterPeriod = await masterPeriodRepo.findById(id);

	if (!MasterPeriod) {
		logger.warn('Master Period not found', { id });
		throw new AppError('Master Period not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Master Period fetched', { id });

	return MasterPeriod;
};

exports.getMasterPeriodByMajorHead = async (major_code_id) => {
	const MasterPeriod = await masterPeriodRepo.findAll({
		where: {
			major_code_id: Number(major_code_id),
		},
		include: [
			{
				model: MasterMajorHead,
				as: 'majorHead',
				attributes: ['m_code', 'm_name'],
			},
		],
	});

	return MasterPeriod || {};
};

/**
 * Delete
 */
exports.deleteMasterPeriod = async (id) => {
	const MasterPeriod = await masterPeriodRepo.findById(id);

	if (!MasterPeriod) {
		logger.warn('Master Period not found for delete', { id });
		throw new AppError('Master Period not found', StatusCodes.NOT_FOUND);
	}

	await masterPeriodRepo.delete(MasterPeriod);

	logger.info('Master Period deleted', { id });

	return true;
};

exports.latestSubCode = async (id) => {
	const latestSubCode = await masterPeriodRepo.latestSubCode();

	let subCode = 1;
	if (latestSubCode) {
		subCode = latestSubCode.id + 1;
	}

	logger.warn('Master Period latest code', { subCode });
	return subCode;
};
