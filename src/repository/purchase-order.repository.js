const { PurchaseOrder } = require('../models/index');

exports.create = (data, options = {}) => {
	return PurchaseOrder.create(data, options);
};

exports.findOne = (options = {}) => {
	return PurchaseOrder.findOne(options);
};

exports.findById = (id, options = {}) => {
	return PurchaseOrder.findByPk(id, options);
};

exports.findAll = (options = {}) => {	
	return PurchaseOrder.findAndCountAll({
		...options,
	});
};

exports.update = (instance, data, options = {}) => {
	return instance.update(data, options);
};

exports.delete = (instance, options = {}) => {
	return instance.destroy(options);
};
