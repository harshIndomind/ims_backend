const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterSubHeadAmountRepo } = require('../repository/index');
const logger = require('../utils/logger');
const {
	MasterMajorHead,
	MasterPeriod,
	MasterMajorHeadAmount,
	MasterSubHead,
	Budget,
	organization,
} = require('../models/index');
const {
	getAmountByMajorHeadAndPeriod,
} = require('../services/masterMajorHeadAmount.service');
const {
	getAmountByMajorHeadAndPeriodAndSubHead,
} = require('../services/budget.service');
const auditLogService = require('./auditLog.service');
const { fn, col } = require('sequelize');

const ENTITY_TYPE = 'sub_head_amount';

/**
 * Create
 */
exports.createSubHeadAmount = async (req, payload) => {
	const { org_id } = req.user;
	const {
		major_head_id,
		period_id,
		sub_head_id,
		amount,
	} = payload;

	if (!major_head_id || !period_id || !sub_head_id || !amount) {
		logger.warn('Validation failed while creating Sub head amount', payload);
		throw new AppError(
			'Major head id, period id, sub head id and amount are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const subHead = await MasterSubHead.findByPk(sub_head_id);
	if (!subHead) {
		throw new AppError('Sub head not found', StatusCodes.NOT_FOUND);
	}
	if (Number(subHead.major_head_id) !== Number(major_head_id)) {
		throw new AppError(
			'Selected sub head does not belong to the selected major head',
			StatusCodes.BAD_REQUEST,
		);
	}

	const existing = await masterSubHeadAmountRepo.getAmountByMajorHeadAndPeriod({
		where: { org_id, major_head_id, period_id, sub_head_id },
	});
	if (existing) {
		throw new AppError(
			'A sub head amount already exists for this major head, period and sub head combination',
			StatusCodes.CONFLICT,
		);
	}

	const majorHeadAmount = await getAmountByMajorHeadAndPeriod(
		org_id,
		major_head_id,
		period_id,
	);

	if (!majorHeadAmount) {
		throw new AppError('Major head amount not found', StatusCodes.NOT_FOUND);
	}

	const subHeadAmount = await getSubAmountByMajorHeadAndPeriod(
		org_id,
		major_head_id,
		period_id,
	);
	logger.info('Sub head amount for major head and period fetched', {
		major_head_id,
		period_id,
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

	await auditLogService.record({
		req,
		entityType: ENTITY_TYPE,
		entityId: subHeadAmountData.id,
		action: 'create',
		newState: subHeadAmountData.toJSON(),
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

	const before = masterMajorHeadAmount.toJSON();

	if (Number(sub_head_id) !== Number(masterMajorHeadAmount.sub_head_id)) {
		const subHead = await MasterSubHead.findByPk(sub_head_id);
		if (!subHead) {
			throw new AppError('Sub head not found', StatusCodes.NOT_FOUND);
		}
		if (Number(subHead.major_head_id) !== Number(major_head_id)) {
			throw new AppError(
				'Selected sub head does not belong to the selected major head',
				StatusCodes.BAD_REQUEST,
			);
		}
	}

	const budgetData = await getAmountByMajorHeadAndPeriodAndSubHead(
		masterMajorHeadAmount.major_head_id,
		masterMajorHeadAmount.period_id,
		masterMajorHeadAmount.sub_head_id,
	);
	const budgetUsedAmount = budgetData ? Number(budgetData.total_budget_used ?? 0) : 0;
	if (budgetUsedAmount > 0) {
		throw new AppError(
			'Amount cannot be edited — budgets are already using this sub-head allocation',
			StatusCodes.UNPROCESSABLE_ENTITY,
		);
	}

	const majorHeadAmount = await getAmountByMajorHeadAndPeriod(
		org_id,
		major_head_id,
		period_id,
	);

	if (!majorHeadAmount) {
		throw new AppError('Major head amount not found', StatusCodes.NOT_FOUND);
	}

	const subHeadAmount = await getSubAmountByMajorHeadAndPeriod(
		org_id,
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
exports.getAllSubHeadAmount = async (req) => {
	const { org_id } = req.user;
	const { limit, offset, period_id, major_head_id, sub_head_id } = req.query;

	const where = { org_id };
	if (period_id)     where.period_id     = Number(period_id);
	if (major_head_id) where.major_head_id = Number(major_head_id);
	if (sub_head_id)   where.sub_head_id   = Number(sub_head_id);

	const options = {};
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset);
	}
	logger.info('Fetching all Sub head amounts');
	const result = await masterSubHeadAmountRepo.findAll({
		where,
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

	const rows = await Promise.all(
		result.rows.map(async (row) => {
			const budgetData = await getAmountByMajorHeadAndPeriodAndSubHead(
				row.major_head_id,
				row.period_id,
				row.sub_head_id,
			).catch(() => null);
			const budgetUsedAmount = parseFloat(
				(budgetData ? Number(budgetData.total_budget_used ?? 0) : 0).toFixed(2),
			);
			const subHeadRemainingAmount = parseFloat(
				(Number(row.amount) - budgetUsedAmount).toFixed(2),
			);
			return { ...row.toJSON(), budgetUsedAmount, subHeadRemainingAmount };
		}),
	);

	return { count: result.count, rows };
};

/**
 * Get By ID
 */
exports.getSubHeadAmountById = async (req, id) => {
	const { org_id } = req.user;
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
		org_id,
		masterMajorHeadAmount.major_head_id,
		masterMajorHeadAmount.period_id,
	);

	const budgetData = await getAmountByMajorHeadAndPeriodAndSubHead(
		masterMajorHeadAmount.major_head_id,
		masterMajorHeadAmount.period_id,
		masterMajorHeadAmount.sub_head_id,
	);

	const budgetUsedAmount = parseFloat((budgetData ? Number(budgetData.total_budget_used ?? 0) : 0).toFixed(2));
	const subHeadRemainingAmount = parseFloat((Number(masterMajorHeadAmount.amount) - budgetUsedAmount).toFixed(2));

	const responseData = {
		...masterMajorHeadAmount.toJSON(),
		subHeadAmount,
		budgetUsedAmount,
		subHeadRemainingAmount,
	};

	return responseData;
};

/**
 * Delete
 */
exports.deleteSubHeadAmount = async (req, id) => {
	const masterMajorHeadAmount = await masterSubHeadAmountRepo.findById(id);

	if (!masterMajorHeadAmount) {
		logger.warn('Sub head amount not found for delete', { id });
		throw new AppError('Sub head amount not found', StatusCodes.NOT_FOUND);
	}

	// Budgets.sub_head_amount_id is ON DELETE CASCADE off this table — deleting
	// unguarded would silently wipe out any budgets already created against it.
	const budgetCount = await Budget.count({ where: { sub_head_amount_id: id } });
	if (budgetCount > 0) {
		throw new AppError(
			'Cannot delete — budgets are already using this sub-head allocation',
			StatusCodes.UNPROCESSABLE_ENTITY,
		);
	}

	const before = masterMajorHeadAmount.toJSON();

	await masterSubHeadAmountRepo.delete(masterMajorHeadAmount);

	logger.info('Sub head amount deleted', { id });

	await auditLogService.record({
		req,
		entityType: ENTITY_TYPE,
		entityId: Number(id),
		action: 'delete',
		previousState: before,
	});

	return true;
};

const getSubAmountByMajorHeadAndPeriod = async (org_id, major_head_id, period_id) => {
	return await masterSubHeadAmountRepo.getSubAmountByMajorHeadAndPeriod(
		'amount',
		{
			where: { org_id, major_head_id, period_id },
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
