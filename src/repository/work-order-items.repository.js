const { WorkOrderItem } = require('../models/index');

exports.create = (data, options = {}) => {
	return WorkOrderItem.create(data, options);
};

exports.findById = (id, options = {}) => {
	return WorkOrderItem.findByPk(id, options);
};

exports.findOne = (options = {}) => {
	return WorkOrderItem.findOne(options);
};

exports.findAll = (where = {}, options = {}) => {
	return WorkOrderItem.findAndCountAll({ where, ...options });
};

exports.update = (instance, data, options = {}) => {
	return instance.update(data, options);
};

exports.delete = (instance, options = {}) => {
	return instance.destroy(options);
};
