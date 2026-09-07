const { body, param } = require('express-validator');

exports.validationGetInvoiceableItems = [
	param('document_type').isIn(['purchase_order', 'work_order']).withMessage('document_type must be purchase_order or work_order'),
	param('document_id').isInt().withMessage('document_id must be a valid id').toInt(),
];

exports.validationCreatePurchaseInvoice = [
	body('document_type')
		.notEmpty()
		.withMessage('document_type is required')
		.isIn(['purchase_order', 'work_order'])
		.withMessage('document_type must be purchase_order or work_order'),
	body('document_id').notEmpty().withMessage('document_id is required').isInt().withMessage('document_id must be a valid id').toInt(),

	body('vendor_invoice_no').notEmpty().withMessage('vendor_invoice_no is required').isString().trim(),
	body('vendor_invoice_date').notEmpty().withMessage('vendor_invoice_date is required').isISO8601().withMessage('vendor_invoice_date must be a valid date'),
	body('invoice_date').optional({ checkFalsy: true }).isISO8601().withMessage('invoice_date must be a valid date'),

	body('remarks').optional({ checkFalsy: true }).isString().trim(),
	body('isRoundOff').optional().isBoolean().withMessage('isRoundOff must be a boolean').toBoolean(),

	body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
	body('items.*.po_wo_item_id').isInt().withMessage('Each item requires a valid po_wo_item_id').toInt(),
	body('items.*.invoiced_qty').isFloat({ gt: 0 }).withMessage('invoiced_qty must be greater than 0'),
	body('items.*.price').isFloat({ min: 0 }).withMessage('price is required for each item'),
	body('items.*.remarks').optional({ checkFalsy: true }).isString().trim(),

	// Other charges (freight, loading/unloading, etc.) — optional, additive,
	// not matched against anything on the PO/WO.
	body('other_charges').optional().isArray().withMessage('other_charges must be an array'),
	body('other_charges.*.charge_type_id').optional({ checkFalsy: true }).isInt().withMessage('Invalid charge type').toInt(),
	body('other_charges.*.description').optional({ checkFalsy: true }).isString().trim(),
	body('other_charges.*.amount').isFloat({ min: 0 }).withMessage('Each other charge requires a valid amount'),
	body('other_charges.*.charge_basis')
		.optional({ checkFalsy: true })
		.isIn(['pre_tax', 'post_tax'])
		.withMessage('charge_basis must be pre_tax or post_tax'),
	body('other_charges.*.value_type')
		.optional({ checkFalsy: true })
		.isIn(['rupee', 'percentage'])
		.withMessage('value_type must be rupee or percentage'),
	body('other_charges.*.operation_type')
		.optional({ checkFalsy: true })
		.isIn(['+', '-'])
		.withMessage('operation_type must be + or -'),
	body('other_charges.*.remarks').optional({ checkFalsy: true }).isString().trim(),
];

exports.validationRejectOrCancel = [
	body('remarks').notEmpty().withMessage('Remarks are required').isString().trim(),
];
