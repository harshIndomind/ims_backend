const { MasterPeriod, MasterMajorHead } = require('../models/index');

exports.create = (data, options = {}) => {
	return MasterPeriod.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterPeriod.findByPk(id, options);
};

exports.findAll = (options = {}) => {
	return MasterPeriod.findAndCountAll({
		...options,
	});
};

exports.update = (instance, data, options = {}) => {
	return instance.update(data, options);
};

exports.delete = (instance, options = {}) => {
	return instance.destroy(options);
};

exports.latestSubCode = () => {
	return MasterPeriod.findOne({
		attributes: ['id', 'sh_code'],
		order: [['id', 'DESC']],
		paranoid: false
	});
};
