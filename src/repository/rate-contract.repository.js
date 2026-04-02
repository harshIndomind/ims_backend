const { RateContract } = require('../models/index');

exports.create = (data, options = {}) => {
	return RateContract.create(data, options);
};

exports.findOne = (options = {}) => {
	return RateContract.findOne(options);
};


exports.findById = (id, options = {}) => {
	return RateContract.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {	
	return RateContract.findAndCountAll({
		where,
		...options,
	});
};

exports.update = (instance, data, options = {}) => {
	return instance.update(data, options);
};

exports.delete = (instance, options = {}) => {
	return instance.destroy(options);
};
