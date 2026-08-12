const { OrderAcknowledgementItem } = require('../models/index');

exports.bulkCreate = (rows, options = {}) => {
	return OrderAcknowledgementItem.bulkCreate(rows, options);
};

exports.findAllForAcknowledgement = (acknowledgementId, options = {}) => {
	return OrderAcknowledgementItem.findAll({
		where: { acknowledgement_id: acknowledgementId },
		...options,
	});
};
