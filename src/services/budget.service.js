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
	MasterAccount
} = require('../models/index');
const {
	getAmountByMajorHeadAndPeriod,
} = require('./masterMajorHeadAmount.service');
const { fn, col, Op } = require('sequelize');
const parseDate = require('../utils/parse-date');

exports.createBudget = async (req, payload) => {
	// 🔒 Example business rule
	// if (!payload.budgetid) {
	//   throw new AppError('Budget ID is required', StatusCodes.BAD_REQUEST);
	// }
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

	return budgetRepo.updateById(id, payload);
};

exports.getAllBudgets = async (req) => {
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
		budgetId,
	} = req.query;

	if (!fromDate || !toDate) {
		throw new AppError("fromDate and toDate are required");
	}

	const from_date = parseDate(fromDate);
	const to_date = parseDate(toDate);
	to_date.setDate(to_date.getDate() + 1);

	if (isNaN(from_date) || isNaN(to_date)) {
		throw new AppError("Invalid date range");
	}

	const where = {
		is_lock: selectedStatusId === "lock" ? 1 : 0,
		budgetType: selectedBudgetTypeId,
		createdAt: {
			[Op.gte]: from_date,
			[Op.lt]: to_date,
		},
	};

	const periodId = Number(selectedPeriodId);
	const departmentId = Number(selectedDepartmentId);
	const costCenterId = Number(selectedCostCenterId);

	if (periodId > 0) where.period_id = periodId;
	if (departmentId > 0) where.department_id = departmentId;
	if (costCenterId > 0) where.cost_center_id = costCenterId;
	if (budgetId) where.budget_id = budgetId;

	const filterOptions = {
		where,
		include: [
			{
				model: MasterMajorHead,
				as: "majorHead",
				attributes: ["id", "m_code", "m_name"],
			},
			{
				model: MasterSubHead,
				as: "subHead",
				attributes: ["id", "sh_code", "sh_name"],
			},
			{
				model: MasterPeriod,
				as: "period",
				attributes: ["id", "period_short", "period", "period_detail"],
			},
			{
				model: organization,
				as: "organization",
			},
			{
				model: Department,
				as: "department",
				attributes: ['id', 'name']
			},
			{
				model: CostCenter,
				as: "cost_center",
				attributes: ['id', 'code', 'name'],
				include: {model: MasterAccount, as: 'account', attributes: ['id', 'A_NAME', 'A_CODE'],}
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

exports.approveBudget = async (budget_ids) => {
	if (!budget_ids || !Array.isArray(budget_ids) || budget_ids.length === 0) {
		throw new AppError(
			'budget_ids must be a non-empty array',
			StatusCodes.BAD_REQUEST,
		);
	}

	const updatedBudgets = [];

	for (const id of budget_ids) {
		const budget = await budgetRepo.findById(id);

		if (!budget) {
			throw new AppError(
				`Budget with ID ${id} not found`,
				StatusCodes.NOT_FOUND,
			);
		}

		const updatedBudget = await budgetRepo.updateById(id, {
			sanc_by: 'yes',
			is_lock: 0,
		});

		updatedBudgets.push(updatedBudget);
	}

	return updatedBudgets;
};

exports.getAllApprovedBudgets = async (options = {}, budgetType) => {
	return budgetRepo.findAll(
		{ where: { sanc_by: 'yes', is_lock: 0, budgetType } },
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
			],
		},
	);
};
