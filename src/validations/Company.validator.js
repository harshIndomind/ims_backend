const { body, param } = require('express-validator');

const phoneRule = (field, label) =>
	body(field)
		.optional({ checkFalsy: true })
		.trim()
		.matches(/^[0-9+\-\s]{7,20}$/)
		.withMessage(`${label} must be 7 to 20 characters (digits, +, - or spaces).`);

exports.validationCreateCompany = [
	body('name')
		.trim()
		.notEmpty()
		.withMessage('Company name is required.')
		.isLength({ max: 255 })
		.withMessage('Company name can be up to 255 characters.'),
	body('description').optional({ checkFalsy: true }).trim(),
	body('address').optional({ checkFalsy: true }).trim(),
	phoneRule('contact_no', 'Contact no.'),
	phoneRule('alt_contact_no', 'Alt contact no.'),
];

exports.validationUpdateCompany = [
	param('id').isInt({ min: 1 }).withMessage('Company id must be a number.'),
	body('name')
		.optional()
		.trim()
		.notEmpty()
		.withMessage('Company name is required.')
		.isLength({ max: 255 })
		.withMessage('Company name can be up to 255 characters.'),
	body('description').optional({ checkFalsy: true }).trim(),
	body('address').optional({ checkFalsy: true }).trim(),
	phoneRule('contact_no', 'Contact no.'),
	phoneRule('alt_contact_no', 'Alt contact no.'),
];