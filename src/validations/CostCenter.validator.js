const { body, param } = require('express-validator');

exports.validationCreateCostCenter = [
	body('code')
		.notEmpty()
		.withMessage('Code is required')
		.isLength({ min: 3, max: 10 })
		.withMessage('Code can be up to 10 characters.')
		.trim(),
	body('name')
		.notEmpty()
		.withMessage('Name is required')
		.isLength({ min: 3, max: 100 })
		.withMessage('Name can be up to 100 characters.')
		.trim(),
	body('station_code').optional({ checkFalsy: true }),
	body('account_id')
		.optional({ checkFalsy: true })
		.isNumeric()
		.withMessage('Account id must be numeric.'),
	body('is_lock').optional({ checkFalsy: true }),
];

exports.validationUpdateCostCenter = [
	param('id')
		.notEmpty()
		.withMessage('Vendor id is required.')
		.isNumeric()
		.withMessage('Vendor id must be numeric.'),
	body('code')
		.optional({ checkFalsy: true })
		.notEmpty()
		.withMessage('Code is required')
		.isLength({ min: 3, max: 10 })
		.withMessage('Code can be up to 10 characters.')
		.trim(),
	body('name')
		.optional({ checkFalsy: true })
		.notEmpty()
		.withMessage('Name is required')
		.isLength({ min: 3, max: 100 })
		.withMessage('Name can be up to 100 characters.')
		.trim(),
	body('station_code').optional({ checkFalsy: true }),
	body('account_id').optional({ checkFalsy: true }).toInt(),
	body('is_lock').optional({ checkFalsy: true }),
];
