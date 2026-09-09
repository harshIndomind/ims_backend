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

	body('vendor_invoice_no')
		.notEmpty()
		.withMessage('vendor_invoice_no is required')
		.isString()
		.trim()
		.matches(/^[A-Za-z0-9]+([/-][A-Za-z0-9]+)*$/)
		.withMessage('vendor_invoice_no must be alphanumeric — / or - allowed only between characters, no spaces or repeats'),
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
	// not matched against anything on the PO/WO. Payload shape is the generic
	// Charge the shared <ChargesTable> component sends for PO/WO too
	// (name/calculationType/value/operation/applyOn/taxTreatment/taxRate) —
	// see purchase-invoice.service.js's preparedCharges loop, which is the
	// authoritative validation for these fields.
	body('other_charges').optional().isArray().withMessage('other_charges must be an array'),
	body('other_charges.*.name').notEmpty().withMessage('Each other charge requires a name').isString().trim(),
	body('other_charges.*.value').isFloat({ min: 0 }).withMessage('Each other charge requires a valid amount'),
	body('other_charges.*.calculationType')
		.optional({ checkFalsy: true })
		.isIn(['FIXED', 'PERCENTAGE'])
		.withMessage('calculationType must be FIXED or PERCENTAGE'),
	body('other_charges.*.operation')
		.optional({ checkFalsy: true })
		.isIn(['+', '-'])
		.withMessage('operation must be + or -'),
	body('other_charges.*.applyOn')
		.optional({ checkFalsy: true })
		.isIn(['NET_TAXABLE_AMOUNT', 'AFTER_TAX'])
		.withMessage('applyOn must be NET_TAXABLE_AMOUNT or AFTER_TAX'),
	body('other_charges.*.taxTreatment')
		.optional({ checkFalsy: true })
		.isIn(['NON_TAXABLE', 'SPECIFIC_RATE', 'INHERIT_ITEM_TAX'])
		.withMessage('taxTreatment must be NON_TAXABLE, SPECIFIC_RATE or INHERIT_ITEM_TAX'),
	body('other_charges.*.taxRate').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('taxRate must be a valid number'),
	body('other_charges.*.remarks').optional({ checkFalsy: true }).isString().trim(),
];

exports.validationRejectOrCancel = [
	body('remarks').notEmpty().withMessage('Remarks are required').isString().trim(),
];
