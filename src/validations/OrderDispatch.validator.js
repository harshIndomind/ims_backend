const { body } = require('express-validator');

// Shared between Purchase Order and Work Order routes — the payload shape is identical for both.

exports.validationDispatchOrder = [
	body('dispatchMethodId')
		.notEmpty()
		.withMessage('Dispatch method is required')
		.isInt()
		.withMessage('Dispatch method must be a valid selection')
		.toInt(),

	body('dispatchDate')
		.notEmpty()
		.withMessage('Dispatch date is required')
		.isISO8601()
		.withMessage('Dispatch date must be a valid date')
		.custom((value) => {
			if (new Date(value) > new Date()) {
				throw new Error('Dispatch date cannot be in the future');
			}
			return true;
		}),

	body('recipientName').optional({ checkFalsy: true }).isString().trim(),

	body('recipientEmail')
		.optional({ checkFalsy: true })
		.isEmail()
		.withMessage('Recipient email must be a valid email address'),

	body('referenceNo').optional({ checkFalsy: true }).isString().trim(),

	body('remarks').optional({ checkFalsy: true }).isString().trim(),
];

exports.validationAcknowledgeOrder = [
	body('acknowledgementModeId')
		.notEmpty()
		.withMessage('Acknowledgement mode is required')
		.isInt()
		.withMessage('Acknowledgement mode must be a valid selection')
		.toInt(),

	body('acknowledgedByName')
		.notEmpty()
		.withMessage('Acknowledged-by name is required')
		.isString()
		.trim(),

	body('acknowledgementDate')
		.notEmpty()
		.withMessage('Acknowledgement date is required')
		.isISO8601()
		.withMessage('Acknowledgement date must be a valid date')
		.custom((value) => {
			if (new Date(value) > new Date()) {
				throw new Error('Acknowledgement date cannot be in the future');
			}
			return true;
		}),

	body('vendorReferenceNo').optional({ checkFalsy: true }).isString().trim(),

	body('dispatchId').optional({ checkFalsy: true }).isInt().withMessage('Invalid dispatch reference').toInt(),

	body('remarks').optional({ checkFalsy: true }).isString().trim(),
];
