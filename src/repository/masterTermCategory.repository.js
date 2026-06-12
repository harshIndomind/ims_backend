const { MasterTermCategory } = require('../models/index');

exports.create = (data, options = {}) => {
	return MasterTermCategory.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterTermCategory.findByPk(id, options);
};

exports.findOne = (options = {}) => {
	return MasterTermCategory.findOne(options);
};

exports.findAll = (where = {}, options = {}) => {
	return MasterTermCategory.findAndCountAll({
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