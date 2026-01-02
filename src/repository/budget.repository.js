const { Budget,MasterMajorHeadAmount } = require('../models/index');


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

exports.getAmountByMajorHeadAndPeriodAndSubHead = (options = {}) => {
	return MasterMajorHeadAmount.findOne({
		...options
	})
};