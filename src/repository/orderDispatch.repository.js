const { OrderDispatch } = require('../models/index');

exports.create = (data, options = {}) => {
	return OrderDispatch.create(data, options);
};

exports.findById = (id, options = {}) => {
	return OrderDispatch.findByPk(id, options);
};

exports.findAllForDocument = (documentType, documentId, options = {}) => {
	return OrderDispatch.findAll({
		where: { document_type: documentType, document_id: documentId },
		order: [['dispatch_no', 'ASC']],
		...options,
	});
};

exports.countForDocument = (documentType, documentId, options = {}) => {
	return OrderDispatch.count({
		where: { document_type: documentType, document_id: documentId },
		...options,
	});
};
