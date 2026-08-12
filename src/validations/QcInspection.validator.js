const { body, param } = require('express-validator');

exports.validationCreateInspection = [
	body('document_type')
		.notEmpty()
		.withMessage('document_type is required')
		.isIn(['purchase_order', 'work_order'])
		.withMessage('document_type must be purchase_order or work_order'),

	body('document_id').notEmpty().withMessage('document_id is required').isInt().withMessage('document_id must be a valid id').toInt(),

	body('acknowledgement_id').optional({ checkFalsy: true }).isInt().withMessage('Invalid acknowledgement reference').toInt(),

	body('template_id').optional({ checkFalsy: true }).isInt().withMessage('Invalid template reference').toInt(),
];

exports.validationAssignInspector = [
	body('inspector_id').notEmpty().withMessage('inspector_id is required').isInt().withMessage('inspector_id must be a valid id').toInt(),
];

exports.validationSaveItems = [
	body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
	body('items.*.id').isInt().withMessage('Each item requires a valid id').toInt(),
	body('items.*.current_received_qty').isFloat({ min: 0 }).withMessage('current_received_qty must be a non-negative number'),
	body('items.*.inspected_qty').isFloat({ min: 0 }).withMessage('inspected_qty must be a non-negative number'),
	body('items.*.accepted_qty').isFloat({ min: 0 }).withMessage('accepted_qty must be a non-negative number'),
	body('items.*.rejected_qty').isFloat({ min: 0 }).withMessage('rejected_qty must be a non-negative number'),
	// rework_qty is hidden on the QC screen for now (deferred feature) — optional, defaults to 0
	// server-side when omitted rather than rejecting the request.
	body('items.*.rework_qty').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('rework_qty must be a non-negative number'),
	body('items.*.rejection_reason_id').optional({ checkFalsy: true }).isInt().withMessage('Invalid rejection reason'),
	body('items.*.remarks').optional({ checkFalsy: true }).isString().trim(),
	body('results').optional().isArray(),
];

exports.validationGetRemaining = [
	param('document_type').isIn(['purchase_order', 'work_order']).withMessage('document_type must be purchase_order or work_order'),
	param('document_id').isInt().withMessage('document_id must be a valid id').toInt(),
];

exports.validationRejectOrCancel = [
	body('remarks').notEmpty().withMessage('Remarks are required').isString().trim(),
];
