const catchAsync = require('../utils/catchAsync');
const userService = require('../services/admin-user.service');

exports.createUserByOrganization = catchAsync(async (req, res) => {
	const user = await userService.createUserByOrganization(req.body, req.user);

	res.status(201).json({
		status: 'success',
		message: 'User created successfully',
		data: user,
	});
});

exports.getAllOrgAdminUsers = catchAsync(async (req, res) => {
	// const org_id = req.user.org_id;
	// const limit = parseInt(req.query.limit) || 10;
	// const offset = parseInt(req.query.offset) || 0;
	// const role_id = parseInt(req.query.selectedRoleId) || 0;

	const users = await userService.getAllOrgAdminUsers(req);

	res.status(200).json({
		status: 'success',
		data: users,
	});
});

exports.findOne = catchAsync(async (req, res) => {
	const userId = req.params.id;
	const user = await userService.findOne(userId);

	res.status(200).json({
		status: 'success',
		data: user,
	});
});

exports.update = catchAsync(async (req, res) => {
	const userId = req.params.id;
	const updatedUser = await userService.update(userId, req.body);

	res.status(200).json({
		status: 'success',
		message: 'User updated successfully',
		data: updatedUser,
	});
});

exports.remove = catchAsync(async (req, res) => {
	const userId = req.params.id;
	await userService.remove(userId);

	res.status(204).json({
		status: 'success',
		message: 'User deleted successfully',
	});
});
