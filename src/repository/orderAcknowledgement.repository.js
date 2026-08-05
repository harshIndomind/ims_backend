const { OrderAcknowledgement } = require('../models/index');

exports.create = (data, options = {}) => {
	return OrderAcknowledgement.create(data, options);
};

exports.findById = (id, options = {}) => {
	return OrderAcknowledgement.findByPk(id, options);
};

exports.findAllForDocument = (documentType, documentId, options = {}) => {
	return OrderAcknowledgement.findAll({
		where: { document_type: documentType, document_id: documentId },
		order: [['createdAt', 'ASC']],
		...options,
	});
};

exports.destroyForDocument = (documentType, documentId, options = {}) => {
	return OrderAcknowledgement.destroy({
		where: { document_type: documentType, document_id: documentId },
		...options,
	});
};
