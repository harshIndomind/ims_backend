const { CostCenter } = require('../models/index');

exports.create = (data, options = {}) => {
	return CostCenter.create(data, options);
};

exports.findById = (id, options = {}) => {
	return CostCenter.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {	
	return CostCenter.findAndCountAll({
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
