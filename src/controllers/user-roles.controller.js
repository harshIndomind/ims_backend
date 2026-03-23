'use strict';

const userRoleService = require('../services/userRoles.service');
const catchAsync = require('../utils/catchAsync');

const createUserRoles = catchAsync(async (req, res, next) => {
	const { user_id, role_ids } = req.body;

	const result = await userRoleService.assignRolesToUser(user_id, role_ids);

	res.status(201).json({
		success: true,
		message: 'Roles assigned successfully',
		data: result,
	});
});

const updateUserRoles = async (req, res, next) => {
	const { user_id } = req.params;
	const { role_ids } = req.body;

	const result = await userRoleService.updateUserRoles(user_id, role_ids);

	res.status(200).json({
		success: true,
		message: 'Roles updated successfully',
		data: result,
	});
};

const getUserRoles = catchAsync(async (req, res, next) => {
	const { user_id } = req.params;

	const result = await userRoleService.getUserWithRoles(user_id);

	res.status(200).json({
		success: true,
		data: result,
	});
});

const getAllUserRoles = catchAsync(async (req, res, next) => {
	const result = await userRoleService.getAllUsersWithRoles(req);

	res.status(200).json({
		success: true,
		data: result,
	});
});

module.exports = {
	createUserRoles,
	updateUserRoles,
	getUserRoles,
	getAllUserRoles,
};
