const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { budgetRepo } = require('../repository/index');
const logger = require('../utils/logger');
const { off } = require('pdfkit');
const {
	MasterMajorHead,
	MasterPeriod,
	MasterMajorHeadAmount,
	MasterSubHead,
	MasterSubHeadAmount,
	Budget,
	organization,
	Department,
	CostCenter,
	MasterAccount,
	MasterUnit,
	User,
} = require('../models/index');
const {
	getAmountByMajorHeadAndPeriod,
} = require('./masterMajorHeadAmount.service');
const { fn, col, Op, literal } = require('sequelize');
const parseDate = require('../utils/parse-date');

const validateBudgetPayload = (payload) => {
	if (payload.budgetType === 'item-wise') {
		if (!payload.product_id) {
			throw new AppError('Product is required for item-wise budget', StatusCodes.BAD_REQUEST);
		}
		if (!payload.qty_for_purchase || Number(payload.qty_for_purchase) < 1) {
			throw new AppError('Qty for purchase must be at least 1 for item-wise budget', StatusCodes.BAD_REQUEST);
		}
	}
	if (payload.budgetType === 'value-wise') {
		if (!payload.amount || Number(payload.amount) < 1) {
			throw new AppError('Amount must be at least 1 for value-wise budget', StatusCodes.BAD_REQUEST);
		}
	}
};

exports.createBudget = async (req, payload) => {
	validateBudgetPayload(payload);
	const { org_id } = req.user;
	const budget = await budgetRepo.create({ ...payload, org_id });

	if (budget) {
		budgetID = `BUD-${String(budget.id).padStart(6, '0')}`;
		await budgetRepo.updateById(budget.id, { budget_id: budgetID });
	}

	return budgetRepo.findById(budget.id);
};

exports.updateBudget = async (id, payload) => {
	const budget = await budgetRepo.findById(id);

	if (!budget) {
		throw new AppError('Budget not found', StatusCodes.NOT_FOUND);
	}

	const mergedType = payload.budgetType ?? budget.budgetType;
	validateBudgetPayload({ ...budget.dataValues, ...payload, budgetType: mergedType });

	return budgetRepo.updateById(id, payload);
};

exports.getAllBudgets = async (req) => {
	const {org_id, role} = req.user;
	const {
		limit,
		offset,
		fromDate,
		toDate,
		selectedPeriodId,
		selectedDepartmentId,
		selectedStatusId,
		selectedCostCenterId,
		selectedBudgetTypeId,
		selectedCategoryId,
		budgetId,
	} = req.query;

	if (!fromDate || !toDate) {
		throw new AppError('fromDate and toDate are required');
	}

	const from_date = parseDate(fromDate);
	const to_date = parseDate(toDate);
	to_date.setDate(to_date.getDate() + 1);

	if (isNaN(from_date) || isNaN(to_date)) {
		throw new AppError('Invalid date range');
	}

	const where = {
		org_id,
		createdAt: {
			[Op.gte]: from_date,
			[Op.lt]: to_date,
		},
	};

	const periodId = Number(selectedPeriodId);
	const departmentId = Number(selectedDepartmentId);
	const costCenterId = Number(selectedCostCenterId);

	if (selectedBudgetTypeId != 'both') where.budgetType = selectedBudgetTypeId;
	if (selectedStatusId != 'all') where.is_lock = selectedStatusId === 'lock' ? 1 : 0;
	if (periodId > 0) where.period_id = periodId;
	if (departmentId > 0) where.department_id = departmentId;
	if (costCenterId > 0) where.cost_center_id = costCenterId;
	if (budgetId) where.budget_id = budgetId; 
	if (selectedCategoryId != 'all') where.category = selectedCategoryId; 
	
	logger.debug("where ", {where})
	const filterOptions = {
		where,
		attributes: {
			include: [
				[
					literal('(SELECT COUNT(DISTINCT `indent_id`) FROM `IndentItems` WHERE `budget_id` = `Budget`.`id`)'),
					'indent_count',
				],
			],
		},
		include: [
			{
				model: MasterMajorHead,
				as: 'majorHead',
				attributes: ['id', 'm_code', 'm_name'],
			},
			{
				model: MasterSubHead,
				as: 'subHead',
				attributes: ['id', 'sh_code', 'sh_name'],
			},
			{
				model: MasterPeriod,
				as: 'period',
				attributes: ['id', 'period_short', 'period', 'period_detail'],
			},
			{
				model: organization,
				as: 'organization',
			},
			{
				model: Department,
				as: 'department',
				attributes: ['id', 'name'],
			},
			{
				model: MasterUnit,
				as: 'unit',
				attributes: ['id', 'unitName', 'unitCd'],
			},
			{
				model: CostCenter,
				as: 'cost_center',
				attributes: ['id', 'code', 'name'],
				include: {
					model: MasterAccount,
					as: 'account',
					attributes: ['id', 'A_NAME', 'A_CODE'],
				},
			},
			{
				model: User,
				as: 'approver',
				attributes: ['id', 'name', 'email'],
				required: false,
			},
		],
	};

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
	}

	return budgetRepo.findAll({}, filterOptions);
};

exports.getBudgetById = async (id) => {
	const budget = await budgetRepo.findById(id, {
		include: [
			{ association: 'majorHead' },
			{ association: 'subHead' },
			{ association: 'period' },
			{ association: 'organization' },
		],
	});

	if (!budget) {
		throw new AppError('Budget not found', StatusCodes.NOT_FOUND);
	}

	return budget;
};

exports.deleteBudget = async (id) => {
	const budget = await budgetRepo.findById(id);

	if (!budget) {
		throw new AppError('Budget not found', StatusCodes.NOT_FOUND);
	}

	await budgetRepo.deleteById(id);
};

const getSubAmountByMajorHeadAndPeriod = async (major_head_id, period_id) => {
	return await budgetRepo.getSubAmountByMajorHeadAndPeriod('amount', {
		where: { major_head_id, period_id },
	});
};

// exports.getAmountByMajorHeadAndPeriodAndSubHead = async (
// 	major_head_id,
// 	period_id,
// 	sub_head_id
// ) => {
// 	const whereClause = { major_head_id, period_id };
// 	const include = [];

// 	if (sub_head_id) {
// 		include.push({
// 			model: MasterSubHeadAmount,
// 			as: 'subHeadAmount',
// 			attributes: [['id', 'sub_head_amount_id'], 'amount'],
// 			where: { sub_head_id },
// 			required: true,
// 		});
// 	}
// 	logger.info('Fetching all Master Major Head Amounts');
// 	return await budgetRepo.getAmountByMajorHeadAndPeriodAndSubHead({
// 		where: whereClause,
// 		include,
// 		attributes: [['id', 'major_head_amount_id'], 'amount'],
// 	});
// };

exports.getAmountByMajorHeadAndPeriodAndSubHead = async (
	major_head_id,
	period_id,
	sub_head_id,
) => {
	if (!major_head_id || !period_id || !sub_head_id) {
		throw new AppError(
			'major_head_id, period_id, and sub_head_id are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const whereClause = {
		major_head_id,
		period_id,
		sub_head_id,
	};

	const include = [
		{
			model: Budget,
			as: 'budgets',
			attributes: [],
			required: false,
		},
	];

	return await budgetRepo.getAmountByMajorHeadAndPeriodAndSubHead({
		where: whereClause,
		include,
	});
};

exports.approveBudget = async (budget_ids, approved_by) => {
	if (!budget_ids || !Array.isArray(budget_ids) || budget_ids.length === 0) {
		throw new AppError(
			'budget_ids must be a non-empty array',
			StatusCodes.BAD_REQUEST,
		);
	}

	logger.info('Approving budgets', { budget_ids, approved_by });

	const updatedBudgets = [];
	const approved_at = new Date();

	for (const id of budget_ids) {
		logger.debug('Processing budget approval', { id, approved_by });

		const budget = await budgetRepo.findById(id);

		if (!budget) {
			logger.warn('Budget not found during approval', { id, approved_by });
			throw new AppError(
				`Budget with ID ${id} not found`,
				StatusCodes.NOT_FOUND,
			);
		}

		const updatedBudget = await budgetRepo.updateById(id, {
			sanc_by: 'yes',
			is_lock: 0,
			approved_by,
			approved_at,
		});

		logger.info('Budget approved successfully', { id, approved_by, approved_at });
		updatedBudgets.push(updatedBudget);
	}

	return updatedBudgets;
};

exports.getAllApprovedBudgets = async (req) => {
	const { limit, offset, budgetType, periodId, departmentId } = req.query;

	const options = {};
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset || 0);
	}

	const where = { sanc_by: 'yes', is_lock: 0 };

	if (budgetType) where.budgetType = budgetType;
	if (periodId) where.period_id = periodId;
	if (departmentId) where.department_id = departmentId;

	return budgetRepo.findAll(
		{ where },
		{
			include: [
				{
					model: MasterPeriod,
					as: 'period',
					attributes: ['id', 'period_short', 'period', 'period_detail'],
				},
				{
					model: MasterMajorHead,
					as: 'majorHead',
					attributes: ['id', 'm_name', 'm_code'],
				},
				{
					model: MasterSubHead,
					as: 'subHead',
					attributes: ['id', 'sh_name', 'sh_code'],
				},
				{ model: organization, as: 'organization' },
				{ model: Department, as: 'department', attributes: ['id', 'name'] },
				{
					model: User,
					as: 'approver',
					attributes: ['id', 'name', 'email'],
					required: false,
				},
			],
		},
	);
};
