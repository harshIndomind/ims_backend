const { MasterMajorHeadAmount } = require('../models/index');

exports.create = (data, options = {}) => {
	return MasterMajorHeadAmount.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterMajorHeadAmount.findByPk(id, options);
};

exports.findAll = (options = {}) => {
	return MasterMajorHeadAmount.findAndCountAll({
		...options,
	});
};

exports.update = (instance, data, options = {}) => {
	return instance.update(data, options);
};

exports.delete = (instance, options = {}) => {
	return instance.destroy(options);
};

exports.getAmountByMajorHeadAndPeriod = (options = {}) => {
	return MasterMajorHeadAmount.findOne({
		...options
	})
};