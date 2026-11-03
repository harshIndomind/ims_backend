const { Issue } = require('../models/index');

exports.create = (data, options = {}) => {
	return Issue.create(data, options);
};

exports.findById = (id, options = {}) => {
	return Issue.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {
	return Issue.findAndCountAll({
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