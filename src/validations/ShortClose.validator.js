const { body, param } = require('express-validator');

exports.validationGetShortCloseableItems = [
	param('document_type').isIn(['purchase_order', 'work_order']).withMessage('document_type must be purchase_order or work_order'),
	param('document_id').isInt().withMessage('document_id must be a valid id').toInt(),
];

exports.validationCreateShortCloseRequest = [
	body('document_type')
		.notEmpty()
		.withMessage('document_type is required')
		.isIn(['purchase_order', 'work_order'])
		.withMessage('document_type must be purchase_order or work_order'),

	body('document_id').notEmpty().withMessage('document_id is required').isInt().withMessage('document_id must be a valid id').toInt(),

	body('reason_id').optional({ checkFalsy: true }).isInt().withMessage('Invalid reason reference').toInt(),

	body('remarks').optional({ checkFalsy: true }).isString().trim(),

	body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
	body('items.*.po_wo_item_id').isInt().withMessage('Each item requires a valid po_wo_item_id').toInt(),
	body('items.*.short_close_qty').isFloat({ gt: 0 }).withMessage('short_close_qty must be greater than 0'),
	body('items.*.remarks').optional({ checkFalsy: true }).isString().trim(),
];

exports.validationRejectOrCancel = [
	body('remarks').notEmpty().withMessage('Remarks are required').isString().trim(),
];
