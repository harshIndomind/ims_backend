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
} = require('../models/index');
const {
	getAmountByMajorHeadAndPeriod,
} = require('./masterMajorHeadAmount.service');
const { fn, col } = require('sequelize');

exports.createBudget = async (payload) => {
  // 🔒 Example business rule
  // if (!payload.budgetid) {
  //   throw new AppError('Budget ID is required', StatusCodes.BAD_REQUEST);
  // }

  const budget = await budgetRepo.create(payload);
  
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

exports.getAllBudgets = async (options = {}) => {
  return budgetRepo.findAll({}, options);
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

exports.getAmountByMajorHeadAndPeriodAndSubHead = async (
	major_head_id,
	period_id,
	sub_head_id
) => {
	const whereClause = { major_head_id, period_id };
	const include = [];

	if (sub_head_id) {
		include.push({
			model: MasterSubHeadAmount,
			as: 'subHeadAmount',
			attributes: ['amount'],
			where: { sub_head_id },
			required: true,
		});
	}
	logger.info('Fetching all Master Major Head Amounts');
	return await budgetRepo.getAmountByMajorHeadAndPeriodAndSubHead({
		where: whereClause,
		include,
		attributes: ['amount'],
	});
};
