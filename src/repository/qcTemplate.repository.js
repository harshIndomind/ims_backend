const { QcTemplate } = require('../models/index');

exports.create = (data, options = {}) => {
	return QcTemplate.create(data, options);
};

exports.findById = (id, options = {}) => {
	return QcTemplate.findByPk(id, options);
};

exports.findAll = (options = {}) => {
	return QcTemplate.findAndCountAll({ ...options });
};

exports.findDefaultFor = (orgId, documentType, options = {}) => {
	const { Op } = require('sequelize');
	return QcTemplate.findOne({
		where: {
			is_active: true,
			is_default: true,
			org_id: { [Op.or]: [orgId, null] },
			document_type: { [Op.in]: [documentType, 'both'] },
		},
		order: [['org_id', 'DESC']],
		...options,
	});
};
