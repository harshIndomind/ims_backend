const { PurchaseOrderItem } = require('../models/index');

exports.create = (data, options = {}) => {
	return PurchaseOrderItem.create(data, options);
};

exports.findById = (id, options = {}) => {
	return PurchaseOrderItem.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {	
	return PurchaseOrderItem.findAndCountAll({
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
