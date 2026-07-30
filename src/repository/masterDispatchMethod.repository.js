const { MasterDispatchMethod } = require('../models/index');

exports.findAllActive = (options = {}) => {
	return MasterDispatchMethod.findAll({
		where: { is_active: true },
		order: [['sort_order', 'ASC']],
		...options,
	});
};

exports.findById = (id, options = {}) => {
	return MasterDispatchMethod.findByPk(id, options);
};
