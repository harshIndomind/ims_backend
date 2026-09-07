const { MasterOtherChargeType } = require('../models/index');

exports.findAllActive = (options = {}) => {
	return MasterOtherChargeType.findAll({
		where: { is_active: true },
		order: [['sort_order', 'ASC']],
		...options,
	});
};

exports.findById = (id, options = {}) => {
	return MasterOtherChargeType.findByPk(id, options);
};
