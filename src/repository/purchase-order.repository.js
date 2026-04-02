const { MasterMajorHead } = require('../models/index');

exports.create = (data, options = {}) => {
	return PurchaseOrder.create(data, options);
};

exports.findById = (id, options = {}) => {
	return PurchaseOrder.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {	
	return PurchaseOrder.findAndCountAll({
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
