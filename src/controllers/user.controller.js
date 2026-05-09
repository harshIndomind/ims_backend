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

// ── Create User ────────────────────────────────────────────
exports.createUser = catchAsync(async (req, res) => {
  const { confirmPassword, password, ...rest } = req.body;

  // Validate passwords match
  if (password !== confirmPassword) {
    throw new AppError('Passwords do not match', 400);
  }

  const data = await userService.createUser(
    { ...rest, password },
    req.user.id
  );

  return res.status(201).json({
    success: true,
    message: 'User created successfully',
    data,
  });
});

// exports.create = [...validateUser, createUser];

exports.updateUser = catchAsync(async (req, res) => {
  const { id }   = req.params;
  const { confirmPassword, password, ...rest } = req.body;

  const data = await userService.updateUser(id, rest, req.user.id);

  return res.json({
	success: true,
	message: 'User updated successfully',
	data,
  });
});

// exports.update = [...validateUpdateUser, updateUser];

// ── Update User Profile ────────────────────────────────────────────
exports.updateUserProfile = catchAsync(async (req, res) => {
	const id = req.user.id;
	const { name, password } = req.body;
	const image = req.files?.image?.[0] ?? null;
	const logo = req.files?.logo?.[0] ?? null;
	const roles = req.user.roles ?? [];

	const data = await userService.updateUserProfile(id, { name, password, image, logo }, roles);

	return res.json({
		success: true,
		message: 'User updated successfully',
		data,
	});
});

exports.getAllUsers = catchAsync(async (req, res) => {
	const { users, total } = await userService.getAllUsers(req);
	res.status(200).json({
		success: true,
		message: 'Users fetched successfully',
		data: users,
		total,
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
	console.log('id => ', id);

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
	const image = req.files?.image?.[0] ?? null;
	const logo = req.files?.logo?.[0] ?? null;
	const roles = req.user.roles ?? [];

	const user = await userService.updateUserProfile(id, { name, password, image, logo }, roles);

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

exports.deactivateUser = catchAsync(async (req, res) => {
	const { id } = req.params;
	await userService.deactivateUser(id);
	res.json({ success: true, message: 'User deactivated' });
});

exports.activateUser = catchAsync(async (req, res) => {
	const { id } = req.params;
	await userService.activateUser(id);
	res.json({ success: true, message: 'User activated' });
});

