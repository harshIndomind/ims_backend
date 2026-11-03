const { Company } = require('../models/index');

exports.create = (data, options = {}) => {
	return Company.create(data, options);
};

exports.findById = (id, options = {}) => {
	return Company.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {
	return Company.findAndCountAll({
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