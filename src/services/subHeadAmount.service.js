const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterSubHeadAmountRepo } = require('../repository/index');
const logger = require('../utils/logger');
const { off } = require('pdfkit');
const {
	MasterMajorHead,
	MasterPeriod,
	MasterMajorHeadAmount,
	MasterSubHead,
	organization,
} = require('../models/index');
const {
	getAmountByMajorHeadAndPeriod,
} = require('../services/masterMajorHeadAmount.service');
const { fn, col } = require('sequelize');

/**
 * Create
 */
exports.createSubHeadAmount = async (req, payload) => {
	const { org_id } = req.user;
	const {
		major_head_amount_id,
		major_head_id,
		period_id,
		sub_head_id,
		amount,
	} = payload;

	const majorHeadAmount = await getAmountByMajorHeadAndPeriod(
		org_id,
		major_head_id,
		period_id,
	);

	if (!majorHeadAmount) {
		throw new AppError('Major head amount not found', StatusCodes.NOT_FOUND);
	}
	console.log('majorHeadAmount ', majorHeadAmount);

	const subHeadAmount = await getSubAmountByMajorHeadAndPeriod(
		major_head_id,
		period_id,
	);
	logger.info('Sub head amount fetched for major head and period', {
		major_head_id,
		period_id,
		subHeadAmount,
	});

	let totalAmountLeftForUse = parseFloat(majorHeadAmount.amount);
	let totalSubHeadAmount = 0;
	if (subHeadAmount) {
		totalSubHeadAmount = subHeadAmount;
		totalAmountLeftForUse = totalAmountLeftForUse - totalSubHeadAmount;
	}

	if (Number(amount) > Number(totalAmountLeftForUse)) {
		throw new AppError(
			`Sub head amount is greater than the left amount for use ${totalAmountLeftForUse}`,
			400,
		);
	}

	if (!major_head_id || !period_id || !amount) {
		logger.warn('Validation failed while creating Sub head amount', payload);
		throw new AppError(
			'Major head id, period id and amount are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const subHeadAmountData = await masterSubHeadAmountRepo.create({
		org_id,
		major_head_amount_id: majorHeadAmount.id,
		major_head_id,
		period_id,
		sub_head_id,
		amount,
	});

	logger.info('Sub head amount created', {
		id: subHeadAmountData.id,
		major_head_amount_id: subHeadAmountData.major_head_amount_id,
		major_head_id: subHeadAmountData.major_head_id,
		period_id: subHeadAmountData.period_id,
		sub_head_id: subHeadAmountData.sub_head_id,
		amount: subHeadAmountData.amount,
	});

	return subHeadAmountData;
};

/**
 * Update
 */
exports.updateSubHeadAmount = async (req, payload) => {
	const { org_id } = req.user;
	const { id } = req.params;
	const {
		major_head_amount_id,
		major_head_id,
		period_id,
		sub_head_id,
		amount,
	} = payload;

	const masterMajorHeadAmount = await masterSubHeadAmountRepo.findById(id);

	if (!masterMajorHeadAmount) {
		logger.warn('Sub head amount not found for update', { id });
		throw new AppError('Sub head amount not found', StatusCodes.NOT_FOUND);
	}

	const majorHeadAmount = await getAmountByMajorHeadAndPeriod(
		major_head_id,
		period_id,
	);

	if (!majorHeadAmount) {
		throw new AppError('Major head amount not found', StatusCodes.NOT_FOUND);
	}
	console.log('majorHeadAmount ', majorHeadAmount);

	const subHeadAmount = await getSubAmountByMajorHeadAndPeriod(
		major_head_id,
		period_id,
	);

	let totalAmountLeftForUse = parseFloat(majorHeadAmount.amount);
	let totalSubHeadAmount = 0;
	if (subHeadAmount) {
		totalSubHeadAmount = subHeadAmount - masterMajorHeadAmount.amount;
		totalAmountLeftForUse = totalAmountLeftForUse - totalSubHeadAmount;
	}

	if (Number(amount) > Number(totalAmountLeftForUse)) {
		throw new AppError(
			`Sub head amount is greater than the left amount for use ${totalAmountLeftForUse}`,
			400,
		);
	}

	await masterSubHeadAmountRepo.update(masterMajorHeadAmount, {
		org_id,
		major_head_amount_id,
		major_head_id,
		period_id,
		sub_head_id,
		amount,
	});

	logger.info('Sub head amount updated', {
		id,
	});

	return masterMajorHeadAmount;
};

/**
 * Get All
 */
exports.getAllSubHeadAmount = async (req) => {
	const { org_id } = req.user;
	const { limit, offset } = req.query;

	const options = {};
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset);
	}
	logger.info('Fetching all Sub head amounts');
	return await masterSubHeadAmountRepo.findAll({
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
				model: MasterSubHead,
				as: 'subHead',
				attributes: ['sh_code', 'sh_name'],
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
exports.getSubHeadAmountById = async (id) => {
	const masterMajorHeadAmount = await masterSubHeadAmountRepo.findById(id, {
		include: [
			{
				model: MasterMajorHeadAmount,
				as: 'majorHeadAmount',
				attributes: ['amount'],
			},
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
				model: MasterSubHead,
				as: 'subHead',
				attributes: ['sh_code', 'sh_name'],
			},
		],
	});

	if (!masterMajorHeadAmount) {
		logger.warn('Sub head amount not found', { id });
		throw new AppError('Sub head amount not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Sub head amount fetched', { id });

	const subHeadAmount = await getSubAmountByMajorHeadAndPeriod(
		masterMajorHeadAmount.major_head_id,
		masterMajorHeadAmount.period_id,
	);

	const responseData = { ...masterMajorHeadAmount.toJSON(), subHeadAmount };

	return responseData;
};

/**
 * Delete
 */
exports.deleteSubHeadAmount = async (id) => {
	const masterMajorHeadAmount = await masterSubHeadAmountRepo.findById(id);

	if (!masterMajorHeadAmount) {
		logger.warn('Sub head amount not found for delete', { id });
		throw new AppError('Sub head amount not found', StatusCodes.NOT_FOUND);
	}

	await masterSubHeadAmountRepo.delete(masterMajorHeadAmount);

	logger.info('Sub head amount deleted', { id });

	return true;
};

const getSubAmountByMajorHeadAndPeriod = async (major_head_id, period_id) => {
	return await masterSubHeadAmountRepo.getSubAmountByMajorHeadAndPeriod(
		'amount',
		{
			where: { major_head_id, period_id },
		},
	);
};

exports.getAmountByMajorHeadAndPeriod = async (
	id,
	major_head_id,
	period_id,
) => {
	logger.info('Fetching all Master Major Head Amounts');
	return await masterSubHeadAmountRepo.getAmountByMajorHeadAndPeriod({
		where: { id, major_head_id, period_id },
		include: [
			{
				model: MasterMajorHeadAmount,
				as: 'majorHeadAmount',
				attributes: ['amount'],
			},
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
				model: MasterSubHead,
				as: 'subHead',
				attributes: ['sh_code', 'sh_name'],
			},
		],
	});
};
