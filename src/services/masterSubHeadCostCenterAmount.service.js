const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterSubHeadCostCenterAmountRepo } = require('../repository/index');
const logger = require('../utils/logger');
const {
	MasterSubHeadAmount,
	MasterMajorHead,
	MasterSubHead,
	MasterPeriod,
	CostCenter,
	Budget,
	organization,
} = require('../models/index');
const auditLogService = require('./auditLog.service');
const { Op } = require('sequelize');

const ENTITY_TYPE = 'sub_head_cost_center_amount';

// Sum of cost-centre splits already allocated against a sub-head-amount — the same
// "children must not exceed parent" cap used one level up (sub-head vs major-head amount).
const getAllocatedAmountForSubHeadAmount = async (sub_head_amount_id) => {
	const total = await masterSubHeadCostCenterAmountRepo.getSumBySubHeadAmount('amount', {
		where: { sub_head_amount_id },
	});
	return Number(total) || 0;
};

// How much of a specific cost-centre allocation has been drawn down by budgets already
// linked to it (Budget.sub_head_cost_center_amount_id).
const getBudgetUsedAmount = async (sub_head_cost_center_amount_id, exclude_budget_id) => {
	const where = { sub_head_cost_center_amount_id };
	if (exclude_budget_id) where.id = { [Op.ne]: exclude_budget_id };
	const budgets = await Budget.findAll({
		where,
		attributes: ['amount', 'tax_duty_amount'],
	});
	return budgets.reduce(
		(sum, b) => sum + Number(b.amount || 0) + Number(b.tax_duty_amount || 0),
		0,
	);
};

/**
 * Create
 */
exports.createSubHeadCostCenterAmount = async (req, payload) => {
	const { org_id } = req.user;
	const { sub_head_amount_id, cost_center_id, amount } = payload;

	if (!sub_head_amount_id || !cost_center_id || !amount) {
		logger.warn('Validation failed while creating Sub head cost center amount', payload);
		throw new AppError(
			'Sub head amount id, cost center id and amount are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const subHeadAmount = await MasterSubHeadAmount.findByPk(sub_head_amount_id);
	if (!subHeadAmount) {
		throw new AppError('Sub head amount not found', StatusCodes.NOT_FOUND);
	}

	const costCenter = await CostCenter.findByPk(cost_center_id);
	if (!costCenter) {
		throw new AppError('Cost center not found', StatusCodes.NOT_FOUND);
	}

	const existing = await masterSubHeadCostCenterAmountRepo.getOne({
		where: { sub_head_amount_id, cost_center_id },
	});
	if (existing) {
		throw new AppError(
			'A cost center allocation already exists for this sub head amount and cost center combination',
			StatusCodes.CONFLICT,
		);
	}

	const alreadyAllocated = await getAllocatedAmountForSubHeadAmount(sub_head_amount_id);
	const amountLeftForUse = Number(subHeadAmount.amount) - alreadyAllocated;

	if (Number(amount) > amountLeftForUse) {
		throw new AppError(
			`Cost center amount is greater than the left amount for use ${amountLeftForUse}`,
			StatusCodes.BAD_REQUEST,
		);
	}

	const data = await masterSubHeadCostCenterAmountRepo.create({
		org_id,
		sub_head_amount_id,
		major_head_id: subHeadAmount.major_head_id,
		sub_head_id: subHeadAmount.sub_head_id,
		period_id: subHeadAmount.period_id,
		cost_center_id,
		amount,
	});

	logger.info('Sub head cost center amount created', {
		id: data.id,
		sub_head_amount_id: data.sub_head_amount_id,
		cost_center_id: data.cost_center_id,
		amount: data.amount,
	});

	await auditLogService.record({
		req,
		entityType: ENTITY_TYPE,
		entityId: data.id,
		action: 'create',
		newState: data.toJSON(),
	});

	return data;
};

/**
 * Update
 */
exports.updateSubHeadCostCenterAmount = async (req, payload) => {
	const { id } = req.params;
	const { cost_center_id, amount } = payload;

	const record = await masterSubHeadCostCenterAmountRepo.findById(id);
	if (!record) {
		logger.warn('Sub head cost center amount not found for update', { id });
		throw new AppError('Sub head cost center amount not found', StatusCodes.NOT_FOUND);
	}

	const before = record.toJSON();

	const budgetCount = await Budget.count({
		where: { sub_head_cost_center_amount_id: id },
	});
	if (budgetCount > 0) {
		throw new AppError(
			'Amount cannot be edited — budgets are already using this cost center allocation',
			StatusCodes.UNPROCESSABLE_ENTITY,
		);
	}

	const nextCostCenterId = cost_center_id ?? record.cost_center_id;
	if (Number(nextCostCenterId) !== Number(record.cost_center_id)) {
		const costCenter = await CostCenter.findByPk(nextCostCenterId);
		if (!costCenter) {
			throw new AppError('Cost center not found', StatusCodes.NOT_FOUND);
		}
		const existing = await masterSubHeadCostCenterAmountRepo.getOne({
			where: {
				sub_head_amount_id: record.sub_head_amount_id,
				cost_center_id: nextCostCenterId,
				id: { [Op.ne]: id },
			},
		});
		if (existing) {
			throw new AppError(
				'A cost center allocation already exists for this sub head amount and cost center combination',
				StatusCodes.CONFLICT,
			);
		}
	}

	const subHeadAmount = await MasterSubHeadAmount.findByPk(record.sub_head_amount_id);
	const alreadyAllocated = await getAllocatedAmountForSubHeadAmount(record.sub_head_amount_id);
	// Exclude this row's own current amount from the "already allocated" total so we're
	// checking the new amount against the ceiling left by its siblings only.
	const siblingsAllocated = alreadyAllocated - Number(record.amount);
	const amountLeftForUse = Number(subHeadAmount.amount) - siblingsAllocated;
	const nextAmount = amount ?? record.amount;

	if (Number(nextAmount) > amountLeftForUse) {
		throw new AppError(
			`Cost center amount is greater than the left amount for use ${amountLeftForUse}`,
			StatusCodes.BAD_REQUEST,
		);
	}

	await masterSubHeadCostCenterAmountRepo.update(record, {
		cost_center_id: nextCostCenterId,
		amount: nextAmount,
	});

	logger.info('Sub head cost center amount updated', { id });

	await auditLogService.recordChange({
		req,
		entityType: ENTITY_TYPE,
		entityId: record.id,
		action: 'update',
		before,
		after: record.toJSON(),
	});

	return record;
};

/**
 * Get All
 */
exports.getAllSubHeadCostCenterAmount = async (req) => {
	const { org_id } = req.user;
	const {
		limit,
		offset,
		period_id,
		major_head_id,
		sub_head_id,
		sub_head_amount_id,
		cost_center_id,
		sortOrder,
		excludeBudgetId,
	} = req.query;

	const where = { org_id };
	if (period_id) where.period_id = Number(period_id);
	if (major_head_id) where.major_head_id = Number(major_head_id);
	if (sub_head_id) where.sub_head_id = Number(sub_head_id);
	if (sub_head_amount_id) where.sub_head_amount_id = Number(sub_head_amount_id);
	if (cost_center_id) where.cost_center_id = Number(cost_center_id);

	const options = {};
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset);
	}

	const result = await masterSubHeadCostCenterAmountRepo.findAll({
		where,
		order: [['createdAt', String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC']],
		...options,
		include: [
			{ model: MasterMajorHead, as: 'majorHead', attributes: ['m_code', 'm_name'] },
			{ model: MasterSubHead, as: 'subHead', attributes: ['sh_code', 'sh_name'] },
			{ model: MasterPeriod, as: 'period', attributes: ['period', 'period_detail', 'period_short'] },
			{ model: CostCenter, as: 'cost_center', attributes: ['id', 'code', 'name'] },
			{ model: organization, as: 'organization', attributes: ['org_code', 'org_name'] },
		],
	});

	const excludeId = excludeBudgetId ? Number(excludeBudgetId) : undefined;
	const rows = await Promise.all(
		result.rows.map(async (row) => {
			const budgetUsedAmount = parseFloat(
				(await getBudgetUsedAmount(row.id, excludeId)).toFixed(2),
			);
			const remainingAmount = parseFloat((Number(row.amount) - budgetUsedAmount).toFixed(2));
			return { ...row.toJSON(), budgetUsedAmount, remainingAmount };
		}),
	);

	return { count: result.count, rows };
};

/**
 * Get By ID
 */
exports.getSubHeadCostCenterAmountById = async (req, id) => {
	const { excludeBudgetId } = req.query;

	const record = await masterSubHeadCostCenterAmountRepo.findById(id, {
		include: [
			{ model: MasterSubHeadAmount, as: 'subHeadAmount', attributes: ['id', 'amount', 'major_head_amount_id'] },
			{ model: MasterMajorHead, as: 'majorHead', attributes: ['m_code', 'm_name'] },
			{ model: MasterSubHead, as: 'subHead', attributes: ['sh_code', 'sh_name'] },
			{ model: MasterPeriod, as: 'period', attributes: ['period', 'period_detail', 'period_short'] },
			{ model: CostCenter, as: 'cost_center', attributes: ['id', 'code', 'name'] },
		],
	});

	if (!record) {
		logger.warn('Sub head cost center amount not found', { id });
		throw new AppError('Sub head cost center amount not found', StatusCodes.NOT_FOUND);
	}

	const budgetUsedAmount = parseFloat(
		(await getBudgetUsedAmount(id, excludeBudgetId ? Number(excludeBudgetId) : undefined)).toFixed(2),
	);
	const remainingAmount = parseFloat((Number(record.amount) - budgetUsedAmount).toFixed(2));

	return { ...record.toJSON(), budgetUsedAmount, remainingAmount };
};

/**
 * Delete
 */
exports.deleteSubHeadCostCenterAmount = async (req, id) => {
	const record = await masterSubHeadCostCenterAmountRepo.findById(id);
	if (!record) {
		logger.warn('Sub head cost center amount not found for delete', { id });
		throw new AppError('Sub head cost center amount not found', StatusCodes.NOT_FOUND);
	}

	const budgetCount = await Budget.count({ where: { sub_head_cost_center_amount_id: id } });
	if (budgetCount > 0) {
		throw new AppError(
			'Cannot delete — budgets are already using this cost center allocation',
			StatusCodes.UNPROCESSABLE_ENTITY,
		);
	}

	const before = record.toJSON();

	await masterSubHeadCostCenterAmountRepo.delete(record);

	logger.info('Sub head cost center amount deleted', { id });

	await auditLogService.record({
		req,
		entityType: ENTITY_TYPE,
		entityId: Number(id),
		action: 'delete',
		previousState: before,
	});

	return true;
};
