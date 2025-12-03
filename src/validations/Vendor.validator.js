const { body, param } = require('express-validator');

exports.validationCreateVendor = [
	// Base fields
	body('roleId')
		.notEmpty()
		.withMessage('Role ID is required')
		.isInt()
		.withMessage('Role ID must be a number')
		.toInt(),

	body('orgId')
		.notEmpty()
		.withMessage('Organization ID is required')
		.isInt()
		.withMessage('Organization ID must be a number')
		.custom((val) => {
			if(val == 0){
				throw new Error('Organization ID is required')
			}
			return true;
		})
		.toInt(),

	body('name').notEmpty().withMessage('Name is required'),

	body('email')
		.notEmpty()
		.withMessage('Email is required')
		.custom((value) => {
			// Must be something like user@domain.com (no extra dots before domain)
			const regex = /^[^\s@]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}$/;

			if (!regex.test(value)) {
				throw new Error(`Invalid email: ${value}`);
			}

			return true;
		}),

	body('password').notEmpty().withMessage('Password is required'),

	// vendorCompany
	body('vendorCompany.name').notEmpty().withMessage('Company name is required'),

	body('vendorCompany.code')
		.isLength({ min: 1, max: 5 })
		.withMessage('Company code can be up to 5 characters.')
		.notEmpty()
		.withMessage('Company code is required')
		.matches(/^[A-Z0-9]+$/)
		.withMessage('Company code must be uppercase letters or numbers only.')
		.trim(),

	body('vendorCompany.account_code')
		.optional({ checkFalsy: true })
		.isLength({ min: 1, max: 5 })
		.withMessage('Account code can be up to 5 characters.')
		.matches(/^[A-Z0-9]+$/)
		.withMessage('Account code must be uppercase letters or numbers only.')
		.trim(),

	body('vendorCompany.email')
		.optional()
		.custom((value) => {
			if (!value) return true;

			const emails = value.split(',').map((e) => e.trim());

			// Check each email
			for (const email of emails) {
				// Express-validator email regex
				if (!/^[^\s@]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}$/.test(email)) {
					throw new Error(`Invalid email: ${email}`);
				}
			}

			return true;
		}),

	body('vendorCompany.contactNo')
		.optional()
		.matches(/^[0-9+\-()\s]*$/)
		.withMessage('Invalid contact number'),

	body('vendorCompany.address').optional(),
	body('vendorCompany.pan').optional(),

	body('vendorCompany.registrationType')
		.notEmpty()
		.withMessage('Registration type is required')
		.isInt()
		.withMessage('Registration type must be a number')
		.toInt(),

	body('vendorCompany.gstin')
		.custom((value, { req }) => {
			const regType = req.body.vendorCompany?.registrationType;

			// When registrationType = 1, gstin is required
			if (regType == 1) {
				if (!value || value.trim() === '') {
					throw new Error(
						'GSTIN is required when registration type is Regular'
					);
				}

				// Optional: validate GSTIN format
				if (!/^[0-9A-Z]{15}$/.test(value)) {
					throw new Error('Invalid GSTIN format');
				}
			}

			// For other types, GSTIN can be empty or optional
			return true;
		})
		.optional(),

	// billingAddress
	body('billingAddress.address1')
		.notEmpty()
		.withMessage('Address1 is required'),

	body('billingAddress.address2').optional(),
	body('billingAddress.landmark').optional(),
	body('billingAddress.country').optional(),

	body('billingAddress.country_id')
		.notEmpty()
		.withMessage('Country ID is required'),

	body('billingAddress.state_id')
		.notEmpty()
		.withMessage('State ID is required'),

	body('billingAddress.state').optional(),

	body('billingAddress.pincode')
		.notEmpty()
		.withMessage('Pincode is required')
		.trim()
		.matches(/^\d{6}$/)
		.withMessage('Pincode must be exactly 6 digits'),

	body('billingAddress.city').notEmpty().withMessage('City is required'),

	// Opening Balance - vendor
	body('openingBalance.vendor').optional(),

	body('openingBalance.vendor.balance_type')
		.optional()
		.isIn(['credit', 'debit'])
		.withMessage('Balance type must be credit or debit'),

	body('openingBalance.vendor.amount')
		.optional()
		.isNumeric()
		.withMessage('Amount must be number')
		.toFloat(),

	// Opening Balance - customer
	body('openingBalance.customer').optional(),

	body('openingBalance.customer.balance_type')
		.optional()
		.isIn(['credit', 'debit'])
		.withMessage('Balance type must be credit or debit'),

	body('openingBalance.customer.amount')
		.optional()
		.isNumeric()
		.withMessage('Amount must be number')
		.toFloat(),

	// bankDetails
	body('bankDetails.bank_name').optional(),
	body('bankDetails.ifsc_code').optional(),
	body('bankDetails.account_no').optional(),
	body('bankDetails.branch_name').optional(),

	// additionalDetails
	body('additionalDetails.fax').optional(),
	body('additionalDetails.website').optional(),

	body('additionalDetails.credit_limit')
		.optional()
		.isNumeric()
		.withMessage('Credit limit must be number')
		.toFloat(),

	body('additionalDetails.due_days')
		.optional()
		.isNumeric()
		.withMessage('Due days must be number')
		.toInt(),

	body('additionalDetails.note').optional(),
];

exports.validationUpdateVendor = [
	param('id')
		.notEmpty()
		.withMessage('Vendor id is required.')
		.isNumeric()
		.withMessage('Vendor id must be numeric.'),
	// Base fields (optional in update)
	body('roleId')
		.optional({ checkFalsy: true })
		.isInt()
		.withMessage('Role ID must be a number')
		.toInt(),

	body('orgId')
		.optional({ checkFalsy: true })
		.isInt()
		.withMessage('Organization ID must be a number')
		.toInt(),

	body('name').optional({ checkFalsy: true }),

	body('email')
		.optional({ checkFalsy: true })
		.custom((value) => {
			// Must be something like user@domain.com (no extra dots before domain)
			const regex = /^[^\s@]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}$/;

			if (!regex.test(value)) {
				throw new Error(`Invalid email: ${value}`);
			}

			return true;
		}),

	body('password').optional({ checkFalsy: true }),

	// vendorCompany
	body('vendorCompany.name').optional({ checkFalsy: true }),

	body('vendorCompany.code')
		.optional({ checkFalsy: true })
		.isLength({ min: 1, max: 5 })
		.withMessage('Company code can be up to 5 characters.')
		.matches(/^[A-Z0-9]+$/)
		.withMessage('Company code must be uppercase letters or numbers only.')
		.trim(),

	body('vendorCompany.account_code')
		.optional({ checkFalsy: true })
		.isLength({ min: 1, max: 5 })
		.withMessage('Account code can be up to 5 characters.')
		.matches(/^[A-Z0-9]+$/)
		.withMessage('Account code must be uppercase letters or numbers only.')
		.trim(),

	body('vendorCompany.email')
		.optional({ checkFalsy: true })
		.custom((value) => {
			if (!value) return true;

			const emails = value.split(',').map((e) => e.trim());

			// Check each email
			for (const email of emails) {
				// Express-validator email regex
				if (!/^[^\s@]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}$/.test(email)) {
					throw new Error(`Invalid email: ${email}`);
				}
			}

			return true;
		}),

	body('vendorCompany.contactNo')
		.optional({ checkFalsy: true })
		.matches(/^[0-9+\-()\s]*$/)
		.withMessage('Invalid contact number'),

	body('vendorCompany.address').optional({ checkFalsy: true }),
	body('vendorCompany.pan').optional({ checkFalsy: true }),

	body('vendorCompany.registrationType')
		.optional({ checkFalsy: true })
		.isInt()
		.withMessage('Registration type must be a number')
		.toInt(),

	body('vendorCompany.gstin')
		.optional({ checkFalsy: true })
		.custom((value, { req }) => {
			const regType = req.body.vendorCompany?.registrationType;

			// Only validate when provided
			if (regType == 1) {
				if (!value || value.trim() === '') {
					throw new Error(
						'GSTIN is required when registration type is Regular'
					);
				}
				if (!/^[0-9A-Z]{15}$/.test(value)) {
					throw new Error('Invalid GSTIN format');
				}
			}
			return true;
		}),

	// billingAddress
	// body('billingAddress.address1').optional({ checkFalsy: true }),
	// body('billingAddress.address2').optional({ checkFalsy: true }),
	// body('billingAddress.landmark').optional({ checkFalsy: true }),
	// body('billingAddress.country').optional({ checkFalsy: true }),
	// body('billingAddress.country_id').optional({ checkFalsy: true }),
	// body('billingAddress.state_id').optional({ checkFalsy: true }),
	// body('billingAddress.state').optional({ checkFalsy: true }),
	body('billingAddress.address1')
		.notEmpty()
		.withMessage('Address1 is required'),

	body('billingAddress.address2').optional(),
	body('billingAddress.landmark').optional(),
	body('billingAddress.country').optional(),

	body('billingAddress.country_id')
		.notEmpty()
		.withMessage('Country ID is required'),

	body('billingAddress.state_id')
		.notEmpty()
		.withMessage('State ID is required'),

	body('billingAddress.state').optional(),

	body('billingAddress.pincode')
		.notEmpty()
		.withMessage('Pincode is required')
		.trim()
		.matches(/^\d{6}$/)
		.withMessage('Pincode must be exactly 6 digits'),

	body('billingAddress.city').notEmpty().withMessage('City is required'),

	body('billingAddress.pincode')
		.optional({ checkFalsy: true })
		.matches(/^\d{6}$/)
		.withMessage('Pincode must be exactly 6 digits'),

	body('billingAddress.city').optional({ checkFalsy: true }),

	// Opening balance
	body('openingBalance.vendor').optional(),
	body('openingBalance.vendor.balance_type')
		.optional({ checkFalsy: true })
		.isIn(['credit', 'debit'])
		.withMessage('Balance type must be credit or debit'),

	body('openingBalance.vendor.amount')
		.optional({ checkFalsy: true })
		.isNumeric()
		.withMessage('Amount must be a number')
		.toFloat(),

	body('openingBalance.customer').optional(),
	body('openingBalance.customer.balance_type')
		.optional({ checkFalsy: true })
		.isIn(['credit', 'debit'])
		.withMessage('Balance type must be credit or debit'),

	body('openingBalance.customer.amount')
		.optional({ checkFalsy: true })
		.isNumeric()
		.withMessage('Amount must be number')
		.toFloat(),

	// bankDetails
	body('bankDetails.bank_name').optional({ checkFalsy: true }),
	body('bankDetails.ifsc_code').optional({ checkFalsy: true }),
	body('bankDetails.account_no').optional({ checkFalsy: true }),
	body('bankDetails.branch_name').optional({ checkFalsy: true }),

	// additionalDetails
	body('additionalDetails.fax').optional({ checkFalsy: true }),
	body('additionalDetails.website').optional({ checkFalsy: true }),

	body('additionalDetails.credit_limit')
		.optional({ checkFalsy: true })
		.isNumeric()
		.withMessage('Credit limit must be number')
		.toFloat(),

	body('additionalDetails.due_days')
		.optional({ checkFalsy: true })
		.isNumeric()
		.withMessage('Due days must be number')
		.toInt(),

	body('additionalDetails.note').optional({ checkFalsy: true }),
];
