const { Budget,MasterSubHeadAmount } = require('../models/index');
const { fn, col, literal } = require('sequelize');

exports.create = async (data, options = {}) => {
  return Budget.create(data, options);
};

exports.updateById = async (id, data, options = {}) => {
  await Budget.update(data, {
    where: { id },
    ...options,
  });

  return Budget.findByPk(id);
};

exports.findAll = async (where = {}, options = {}) => {
  return Budget.findAndCountAll({
    where,
    ...options,
  });
};

exports.findById = async (id, options = {}) => {
  return Budget.findByPk(id, options);
};

exports.deleteById = async (id, options = {}) => {
  return Budget.destroy({
    where: { id },
    ...options,
  });
};

// exports.getAmountByMajorHeadAndPeriodAndSubHead = (options = {}) => {
// 	return MasterMajorHeadAmount.findOne({
// 		...options
// 	})
// };

exports.getAmountByMajorHeadAndPeriodAndSubHead = async ({
  where,
  include,
}) => {
  return MasterSubHeadAmount.findOne({
    where,
    attributes: [
      ['id', 'sub_head_amount_id'],
      'major_head_amount_id',
      'amount', // base amount

      // TOTAL BUDGET USED
      [
        literal(`
          COALESCE(SUM(budgets.amount + budgets.tax_duty_amount), 0)
        `),
        'total_budget_used',
      ],

      // FINAL AMOUNT
      [
        literal(`
          MasterSubHeadAmount.amount
          -
          COALESCE(SUM(budgets.amount + budgets.tax_duty_amount), 0)
        `),
        'final_amount',
      ],
    ],
    include,
    group: ['MasterSubHeadAmount.id'],
    subQuery: false,
    raw: true,
  });
};