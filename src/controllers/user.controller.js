const { UserService } = require('../services/index');
const catchAsync = require('../utils/catchAsync');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');

const userService = new UserService();

const validateUser = [
	body('name').trim().notEmpty().withMessage('Name is required'),

	body('email').trim().isEmail().withMessage('Invalid email'),

	body('password')
		.trim()
		.optional()
		.isLength({ min: 6 })
		.withMessage('Password must be at least 6 characters'),

	body('roleId').toInt().isInt().withMessage('Role ID must be an integer'),

	body('orgId')
		.toInt()
		.isInt()
		.withMessage('Organization ID must be an integer'),

	body('vendorCompanyName')
		.trim()
		.notEmpty()
		.withMessage('Vendor Company Name is required'),

	body('vendorCompanyCode')
		.trim()
		.notEmpty()
		.withMessage('Vendor Company Code is required'),

	body('vendorContactNo')
		.optional()
		.trim()
		.matches(/^[0-9+\-()\s]*$/)
		.withMessage('Invalid contact number'),

	body('vendorAddress').optional().trim(),
];

const validateUpdateUser = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Invalid email'),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('roleId').toInt().isInt().withMessage('Role ID must be an integer'),
  body('orgId').toInt().isInt().withMessage('Organization ID must be an integer'),
  body('vendorCompanyName').trim().notEmpty().withMessage('Vendor Company Name is required'),
  body('vendorCompanyCode').trim().notEmpty().withMessage('Vendor Company Code is required'),
  body('vendorContactNo')
    .optional()
    .trim()
    .matches(/^[0-9+\-()\s]*$/)
    .withMessage('Invalid contact number'),
  body('vendorAddress').optional().trim(),
];

const createUser = catchAsync(async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const {
		name,
		email,
		password,
		roleId,
		orgId,
		vendorCompanyName,
		vendorCompanyCode,
		vendorContactNo,
		vendorAddress,
	} = req.body;

	const hashedPassword = await bcrypt.hash(password, 10);
	const vendor = await userService.create({
		name,
		email,
		password: hashedPassword,
		roleId,
		org_id: orgId,
		vendor_company_name: vendorCompanyName,
		vendor_company_code: vendorCompanyCode,
		vendor_contact_no: vendorContactNo,
		vendor_address: vendorAddress,
	});

	res.status(201).json({
		status: true,
		message: 'Vendor created successfully',
		data: vendor,
	});
});

exports.create = [...validateUser, createUser];

const updateUser = catchAsync(async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	const { id } = req.params;
	const {
		name,
		email,
		password,
		roleId,
		orgId,
		vendorCompanyName,
		vendorCompanyCode,
		vendorContactNo,
		vendorAddress
	} = req.body;

	const payload = {
		name,
		email,
		roleId,
		org_id: orgId,
		vendor_company_name: vendorCompanyName,
		vendor_company_code: vendorCompanyCode,
		vendor_contact_no: vendorContactNo,
		vendor_address: vendorAddress,
	};

	if(password){
		const hashedPassword = await bcrypt.hash(password, 10);
		payload.password = hashedPassword
	}

	const vendor = await userService.update(id, payload);

	res.status(201).json({
		status: true,
		message: 'Vendor updated successfully',
		data: vendor,
	});
});

exports.update = [...validateUpdateUser, updateUser];

exports.getAllUsers = catchAsync(async (req, res) => {
	const {org_id} = req.user;
	const vendors = await userService.getAllUsers(org_id);
	res.status(201).json({
		status: true,
		message: 'Vendors fetched successfully',
		data: vendors,
	});
});

exports.getUserById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const vendor = await userService.getUserById(id);
	res.status(201).json({
		status: true,
		message: 'Vendor fetched successfully',
		data: vendor,
	});
});

exports.destroy = catchAsync(async (req, res) => {
	const { id } = req.params;
	console.log("id => " , id);
	
	const vendor = await userService.destroy(id);
	res.status(201).json({
		status: true,
		message: 'A vendor deleted successfully',
		data: vendor,
	});
});

exports.getTechSupportUsers = catchAsync(async (req, res) => {
	const { company_id, project_id } = req.params;

	const users = await userService.getTechSupportUsers(company_id, project_id);
	res.status(201).json({
		status: true,
		message: 'Tech support users fetched successfully',
		data: users,
	});
});

exports.updateUserProfile = catchAsync(async (req, res) => {
	const id = req.user.id;
	const { name, password } = req.body;
	const image = req.file;

	const updateData = { name };

	if (password) {
		updateData.password = await bcrypt.hash(password, 10);
	}

	if (image) {
		updateData.image = image.relativePath;
	}

	const user = await userService.update(id, updateData);

	res.status(201).json({
		status: true,
		message: 'User updated successfully',
		data: user,
	});
});

exports.getUserProfileById = catchAsync(async (req, res) => {
	const id = req.user.id;

	const user = await userService.getUserProfileById(id);
	res.status(201).json({
		status: true,
		message: 'User fetched successfully',
		data: user,
	});
});

exports.sendForgotPasswordMail = catchAsync(async (req, res) => {
	const email = req.body.email;

	const user = await userService.sendForgotPasswordMail(email);
	res.status(201).json({
		status: true,
		message: 'A reset password link is sent to you email.',
		data: null,
	});
});

exports.resetPassword = catchAsync(async (req, res) => {
	const { token, password } = req.body;

	const user = await userService.resetPassword(token, password);
	res.status(201).json({
		status: true,
		message: 'A reset password link is sent to you email.',
		data: null,
	});
});
