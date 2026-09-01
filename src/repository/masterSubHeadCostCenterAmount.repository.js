const { MasterSubHeadCostCenterAmount } = require('../models/index');

exports.create = (data, options = {}) => {
	return MasterSubHeadCostCenterAmount.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterSubHeadCostCenterAmount.findByPk(id, options);
};

exports.findAll = (options = {}) => {
	return MasterSubHeadCostCenterAmount.findAndCountAll({
		...options,
	});
};

exports.update = (instance, data, options = {}) => {
	return instance.update(data, options);
};

exports.delete = (instance, options = {}) => {
	return instance.destroy(options);
};

exports.getSumBySubHeadAmount = (col, options = {}) => {
	return MasterSubHeadCostCenterAmount.sum(col, options);
};

exports.getOne = (options = {}) => {
	return MasterSubHeadCostCenterAmount.findOne({
		...options,
	});
};
