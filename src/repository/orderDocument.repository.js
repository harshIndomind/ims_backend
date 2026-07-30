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
