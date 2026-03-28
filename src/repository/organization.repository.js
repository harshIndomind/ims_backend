const { organization } = require('../models/index');

exports.create = (data, options) => {
	return organization.create(data, options);
};

exports.findById = (id, options = {}) => {
	return organization.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {	
	return organization.findAndCountAll({
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