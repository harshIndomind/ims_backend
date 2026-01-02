const { MasterMajorHead } = require('../models/index');

exports.create = (data, options = {}) => {
	return MasterMajorHead.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterMajorHead.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {	
	return MasterMajorHead.findAndCountAll({
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
