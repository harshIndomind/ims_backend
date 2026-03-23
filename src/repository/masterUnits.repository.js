const { MasterUnit } = require('../models/index');

exports.create = (data, options = {}) => {
	return MasterUnit.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterUnit.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {	
	return MasterUnit.findAndCountAll({
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
