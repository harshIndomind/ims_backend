const { MasterAccount } = require('../models/index');

exports.create = (data, options = {}) => {
	return MasterAccount.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterAccount.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {	
	return MasterAccount.findAndCountAll({
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
