const { body, param } = require('express-validator');

const STATUSES = ['not_started', 'in_progress', 'completed'];

exports.validationCreateProject = [
	body('company_id').isInt({ min: 1 }).withMessage('Please select a company.').toInt(),
	body('name')
		.trim()
		.notEmpty()
		.withMessage('Project name is required.')
		.isLength({ max: 255 })
		.withMessage('Project name can be up to 255 characters.'),
	body('description').optional({ checkFalsy: true }).trim(),
	body('status').optional().isIn(STATUSES).withMessage('Invalid project status.'),
	body('start_date')
		.notEmpty()
		.withMessage('Start date is required.')
		.bail()
		.isISO8601()
		.withMessage('Start date must be a valid date.'),
	body('end_date')
		.optional({ checkFalsy: true })
		.isISO8601()
		.withMessage('End date must be a valid date.'),
];

exports.validationUpdateProject = [
	param('id').isInt({ min: 1 }).withMessage('Project id must be a number.'),
	body('company_id').optional().isInt({ min: 1 }).withMessage('Please select a company.').toInt(),
	body('name')
		.optional()
		.trim()
		.notEmpty()
		.withMessage('Project name is required.')
		.isLength({ max: 255 })
		.withMessage('Project name can be up to 255 characters.'),
	body('description').optional({ checkFalsy: true }).trim(),
	body('status').optional().isIn(STATUSES).withMessage('Invalid project status.'),
	body('start_date')
		.optional()
		.isISO8601()
		.withMessage('Start date must be a valid date.'),
	body('end_date')
		.optional({ checkFalsy: true })
		.isISO8601()
		.withMessage('End date must be a valid date.'),
];