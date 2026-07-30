const { MasterAcknowledgementMode } = require('../models/index');

exports.findAllActive = (options = {}) => {
	return MasterAcknowledgementMode.findAll({
		where: { is_active: true },
		order: [['sort_order', 'ASC']],
		...options,
	});
};

exports.findById = (id, options = {}) => {
	return MasterAcknowledgementMode.findByPk(id, options);
};
