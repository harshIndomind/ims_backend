const { body } = require('express-validator');

exports.validationCreateBudgetRevision = [
	body('budget_id').notEmpty().withMessage('budget_id is required').isInt().withMessage('budget_id must be a valid id').toInt(),
	body('revision_amount').isFloat({ gt: 0 }).withMessage('Revision amount must be greater than 0').toFloat(),
	body('reason').notEmpty().withMessage('A reason is required').isString().trim(),
	body('source_document_type')
		.optional({ checkFalsy: true })
		.isIn(['purchase_order', 'work_order'])
		.withMessage('source_document_type must be purchase_order or work_order'),
	body('source_document_id').optional({ checkFalsy: true }).isInt().withMessage('Invalid source document').toInt(),
];

exports.validationRejectOrCancel = [
	body('remarks').notEmpty().withMessage('Remarks are required').isString().trim(),
];
