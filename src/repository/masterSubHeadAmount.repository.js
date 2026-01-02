const { MasterSubHeadAmount } = require('../models/index');

exports.create = (data, options = {}) => {
	return MasterSubHeadAmount.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterSubHeadAmount.findByPk(id, options);
};

exports.findAll = (options = {}) => {
	return MasterSubHeadAmount.findAndCountAll({
		...options,
	});
};

exports.update = (instance, data, options = {}) => {
	return instance.update(data, options);
};

exports.delete = (instance, options = {}) => {
	return instance.destroy(options);
};

exports.getSubAmountByMajorHeadAndPeriod = (col, options = {}) => {
	return MasterSubHeadAmount.sum(col,options);
};

exports.getAmountByMajorHeadAndPeriod = (options = {}) => {
	return MasterSubHeadAmount.findOne({
		...options
	})
};