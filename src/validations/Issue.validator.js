const { body, param } = require('express-validator');

const PRIORITIES = ['low', 'medium', 'high'];
const ISSUE_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

exports.validationCreateIssue = [
	body('project_id').isInt({ min: 1 }).withMessage('Please select a project.').toInt(),
	body('assignee_id').isInt({ min: 1 }).withMessage('Please select a user.').toInt(),
	body('title')
		.trim()
		.notEmpty()
		.withMessage('Issue title is required.')
		.isLength({ max: 255 })
		.withMessage('Issue title can be up to 255 characters.'),
	body('description').trim().notEmpty().withMessage('Description is required.'),
	body('priority').optional().isIn(PRIORITIES).withMessage('Invalid priority.'),
	body('issue_status').optional().isIn(ISSUE_STATUSES).withMessage('Invalid status.'),
];

exports.validationUpdateIssue = [
	param('id').isInt({ min: 1 }).withMessage('Issue id must be a number.'),
	body('project_id').optional().isInt({ min: 1 }).withMessage('Please select a project.').toInt(),
	body('assignee_id').optional().isInt({ min: 1 }).withMessage('Please select a user.').toInt(),
	body('title')
		.optional()
		.trim()
		.notEmpty()
		.withMessage('Issue title is required.')
		.isLength({ max: 255 })
		.withMessage('Issue title can be up to 255 characters.'),
	body('description').optional().trim().notEmpty().withMessage('Description is required.'),
	body('priority').optional().isIn(PRIORITIES).withMessage('Invalid priority.'),
	body('issue_status').optional().isIn(ISSUE_STATUSES).withMessage('Invalid status.'),
];