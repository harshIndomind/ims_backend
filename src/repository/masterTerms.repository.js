const { MasterTermsCondition } = require('../models/index');

exports.create = (data, options = {}) => {
	return MasterTermsCondition.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterTermsCondition.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {	
	return MasterTermsCondition.findAndCountAll({
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
