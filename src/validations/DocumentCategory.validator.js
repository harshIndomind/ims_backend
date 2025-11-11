const { body, param } = require('express-validator');

exports.validationCreateDocument = [
	body('name')
		.notEmpty()
		.withMessage('Document category name is required.')
		.isLength({ min: 1, max: 255 })
		.withMessage('Document category name must be between 1 and 255 characters.')
		.matches(/^[A-Za-z\s]+$/)
		.withMessage(
			'Document category name should only contain alphabets and spaces.'
		)
		.trim(),

	body('short_code')
		.notEmpty()
		.withMessage('Document category code is required.')
		.isLength({ min: 2, max: 50 })
		.withMessage('Document category code must be between 2 and 50 characters.')
		.matches(/^[A-Z_]+$/)
		.withMessage(
			'Document category code must be uppercase and may contain underscores (A-Z, _).'
		)
		.trim(),

	body('s3Path')
		.notEmpty()
		.withMessage('S3 bucket folder path is required.')
		.isLength({ min: 1, max: 255 })
		.withMessage('S3 bucket folder path must be between 1 and 255 characters.')
		.matches(/^[A-Za-z0-9/_-]+$/)
		.withMessage(
			'S3 bucket folder path may contain letters, numbers, slashes, hyphens, and underscores.'
		)
		.trim(),
];

exports.validationUpdateDocument = [
	param('id')
		.notEmpty()
		.withMessage('Id is required.')
		.isNumeric()
		.withMessage('Id should be numeric.'),
        
	body('name')
		.notEmpty()
		.withMessage('Document category name is required.')
		.isLength({ min: 1, max: 255 })
		.withMessage('Document category name must be between 1 and 255 characters.')
		.matches(/^[A-Za-z\s]+$/)
		.withMessage(
			'Document category name should only contain alphabets and spaces.'
		)
		.trim(),

	body('short_code')
		.notEmpty()
		.withMessage('Document category code is required.')
		.isLength({ min: 2, max: 50 })
		.withMessage('Document category code must be between 2 and 50 characters.')
		.matches(/^[A-Z_]+$/)
		.withMessage(
			'Document category code must be uppercase and may contain underscores (A-Z, _).'
		)
		.trim(),

	body('s3Path')
		.notEmpty()
		.withMessage('S3 bucket folder path is required.')
		.isLength({ min: 1, max: 255 })
		.withMessage('S3 bucket folder path must be between 1 and 255 characters.')
		.matches(/^[A-Za-z0-9/_-]+$/)
		.withMessage(
			'S3 bucket folder path may contain letters, numbers, slashes, hyphens, and underscores.'
		)
		.trim(),
];
