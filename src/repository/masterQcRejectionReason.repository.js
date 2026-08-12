const { MasterQcRejectionReason } = require('../models/index');

exports.findAllActive = (options = {}) => {
	return MasterQcRejectionReason.findAll({
		where: { is_active: true },
		order: [['sort_order', 'ASC']],
		...options,
	});
};

exports.findById = (id, options = {}) => {
	return MasterQcRejectionReason.findByPk(id, options);
};
