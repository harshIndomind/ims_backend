const { QcInspection } = require('../models/index');

exports.create = (data, options = {}) => {
	return QcInspection.create(data, options);
};

exports.findOne = (options = {}) => {
	return QcInspection.findOne(options);
};

exports.findById = (id, options = {}) => {
	return QcInspection.findByPk(id, options);
};

exports.findAll = (options = {}) => {
	return QcInspection.findAndCountAll({ ...options });
};

exports.findAllForDocument = (documentType, documentId, options = {}) => {
	return QcInspection.findAll({
		where: { document_type: documentType, document_id: documentId },
		order: [['createdAt', 'DESC']],
		...options,
	});
};

exports.countForOrg = (orgId, options = {}) => {
	return QcInspection.count({ where: { org_id: orgId }, ...options });
};
