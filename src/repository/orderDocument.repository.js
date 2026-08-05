const { OrderDocument } = require('../models/index');

exports.create = (data, options = {}) => {
	return OrderDocument.create(data, options);
};

exports.findAllForContext = (context, contextId, options = {}) => {
	return OrderDocument.findAll({
		where: { context, context_id: contextId },
		order: [['createdAt', 'ASC']],
		...options,
	});
};

exports.findAllForDocument = (documentType, documentId, options = {}) => {
	return OrderDocument.findAll({
		where: { document_type: documentType, document_id: documentId },
		order: [['createdAt', 'ASC']],
		...options,
	});
};

exports.destroyForDocument = (documentType, documentId, options = {}) => {
	return OrderDocument.destroy({
		where: { document_type: documentType, document_id: documentId },
		...options,
	});
};
