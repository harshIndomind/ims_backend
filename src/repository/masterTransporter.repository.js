const { MasterTransporter } = require('../models/index');

exports.create = (data, options = {}) => {
	return MasterTransporter.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterTransporter.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {	
	return MasterTransporter.findAndCountAll({
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
