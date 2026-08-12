const { MasterShortCloseReason } = require('../models/index');

exports.findAllActive = (options = {}) => {
	return MasterShortCloseReason.findAll({
		where: { is_active: true },
		order: [['sort_order', 'ASC']],
		...options,
	});
};

exports.findById = (id, options = {}) => {
	return MasterShortCloseReason.findByPk(id, options);
};
