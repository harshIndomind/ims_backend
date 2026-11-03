const { Project } = require('../models/index');

exports.create = (data, options = {}) => {
	return Project.create(data, options);
};

exports.findById = (id, options = {}) => {
	return Project.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {
	return Project.findAndCountAll({
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