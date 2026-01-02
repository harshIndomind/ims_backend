const { MasterSubHead } = require('../models/index');

exports.create = (data, options = {}) => {
	return MasterSubHead.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterSubHead.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {
	return MasterSubHead.findAndCountAll({
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

exports.latestSubCode = () => {
	return MasterSubHead.findOne({
		attributes: ['id', 'sh_code'],
		order: [['id', 'DESC']],
		paranoid: false
	});
};
