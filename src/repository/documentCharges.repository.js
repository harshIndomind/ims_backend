const { DocumentCharge } = require('../models/index');

exports.getForDocument = (documentType, documentId, options = {}) => {
	return DocumentCharge.findAll({
		where: { document_type: documentType, document_id: documentId },
		order: [['sequence', 'ASC']],
		...options,
	});
};

// Delete-and-recreate on every save — same convention PO/WO already use for their own line
// items on update, simpler and safer than diffing since charges have no downstream FK
// referencing an individual charge row.
exports.bulkReplaceForDocument = async (documentType, documentId, chargeRows, options = {}) => {
	await DocumentCharge.destroy({ where: { document_type: documentType, document_id: documentId }, ...options });
	if (!chargeRows || chargeRows.length === 0) return [];
	return DocumentCharge.bulkCreate(
		chargeRows.map((row) => ({ ...row, document_type: documentType, document_id: documentId })),
		options,
	);
};
