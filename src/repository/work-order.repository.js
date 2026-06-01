const { WorkOrder } = require('../models/index');

exports.create = (data, options = {}) => {
	return WorkOrder.create(data, options);
};

exports.findOne = (options = {}) => {
	return WorkOrder.findOne(options);
};

exports.findById = (id, options = {}) => {
	return WorkOrder.findByPk(id, options);
};

exports.findAll = (options = {}) => {
	return WorkOrder.findAndCountAll({ ...options });
};

exports.update = (instance, data, options = {}) => {
	return instance.update(data, options);
};

exports.delete = (instance, options = {}) => {
	return instance.destroy(options);
};
