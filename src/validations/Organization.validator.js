const { body, param } = require('express-validator');

exports.validationCreateOrganization = [
	// Organization Name
	body('org_name')
		.notEmpty()
		.withMessage('Organization name is required.')
		.isLength({ min: 2, max: 255 })
		.withMessage('Organization name must be between 2 and 255 characters.')
		.matches(/^[A-Za-z0-9\s&.,-]+$/)
		.withMessage(
			'Organization name may contain letters, numbers, and basic symbols.'
		)
		.trim(),

	// Organization Code
	body('org_code')
		.notEmpty()
		.withMessage('Organization code is required.')
		.isLength({ max: 5 })
		.withMessage('Organization code can be up to 5 characters.')
		.matches(/^[A-Z0-9]+$/)
		.withMessage('Organization code must be uppercase letters or numbers only.')
		.trim(),

	// GST Number
	body('org_gst_number')
		.notEmpty()
		.withMessage('GST number is required.')
		.matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
		.withMessage('Invalid GST number format.'),

	// PAN
	body('pan')
		.notEmpty()
		.withMessage('PAN is required.')
		.matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
		.withMessage('Invalid PAN format.'),

	// Email
	body('org_email')
		.notEmpty()
		.withMessage('Organization email is required.')
		.isEmail()
		.withMessage('Invalid email format.')
		.normalizeEmail(),

	// Contact Person
	body('org_person_name')
		.notEmpty()
		.withMessage('Contact person name is required.')
		.isLength({ min: 2, max: 255 })
		.withMessage('Contact person name must be between 2 and 255 characters.')
		.matches(/^[A-Za-z\s]+$/)
		.withMessage(
			'Contact person name should only contain alphabets and spaces.'
		)
		.trim(),

	body('org_person_contact')
		.notEmpty()
		.withMessage('Contact number is required.')
		.matches(/^[6-9]\d{9}$/)
		.withMessage('Invalid contact number.'),

	// Address
	body('org_address')
		.notEmpty()
		.withMessage('Organization address is required.')
		.isLength({ min: 5, max: 500 })
		.withMessage('Organization address must be between 5 and 500 characters.')
		.trim(),

	body('pincode')
		.notEmpty()
		.withMessage('Pincode is required.')
		.isNumeric()
		.withMessage('Pincode must be numeric.')
		.isLength({ min: 6, max: 6 })
		.withMessage('Pincode must be 6 digits.'),

	body('city')
		.notEmpty()
		.withMessage('City is required.')
		.matches(/^[A-Za-z\s]+$/)
		.withMessage('City name should only contain alphabets and spaces.')
		.trim(),

	body('state_id')
		.notEmpty()
		.withMessage('State is required.')
		.isNumeric()
		.withMessage('State id should be numeric'),

	// update_gst_on_invoices
	body('update_gst_on_invoices')
		.isBoolean()
		.withMessage('(Update gst on invoices) must be true or false.'),

	// 🏦 Bank Details Validation (Array)
	body('bankDetails')
		.isArray({ min: 1 })
		.withMessage('At least one bank detail is required.'),

	body('bankDetails.*.account_name')
		.notEmpty()
		.withMessage('Account name is required.')
		.isLength({ min: 2, max: 255 })
		.withMessage('Account name must be between 2 and 255 characters.')
		.trim(),

	body('bankDetails.*.account_no')
		.notEmpty()
		.withMessage('Account number is required.')
		.matches(/^[0-9]{9,18}$/)
		.withMessage('Account number must be between 9 and 18 digits.'),

	body('bankDetails.*.bank_ifsc')
		.notEmpty()
		.withMessage('Bank IFSC code is required.')
		.matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
		.withMessage('Invalid IFSC code format.'),

	body('bankDetails.*.bank_name')
		.notEmpty()
		.withMessage('Bank name is required.')
		.matches(/^[A-Za-z\s]+$/)
		.withMessage('Bank name should only contain alphabets and spaces.')
		.trim(),

	body('bankDetails.*.branch_name')
		.notEmpty()
		.withMessage('Branch name is required.')
		.trim(),

	body('bankDetails.*.swift_code')
		.optional({ checkFalsy: true })
		.matches(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/)
		.withMessage('Invalid SWIFT code format.'),

	body('bankDetails.*.micr_code')
		.optional({ checkFalsy: true })
		.matches(/^[0-9]{9}$/)
		.withMessage('MICR code must be 9 digits.'),

	body('bankDetails.*.upi_id')
		.optional({ checkFalsy: true })
		.matches(/^[\w.-]+@[\w.-]+$/)
		.withMessage('Invalid UPI ID format.'),
];

exports.validationUpdateOrganization = [
	param('id')
		.notEmpty()
		.withMessage('Organization id is required.')
		.isNumeric()
		.withMessage('Organization id must be numeric.'),
	...exports.validationCreateOrganization.map((rule) =>
		rule.optional({ nullable: true })
	),
];
