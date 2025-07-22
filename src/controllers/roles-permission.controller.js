const { RolesPermissionService } = require('../services/index');
const catchAsync = require('../utils/catchAsync');
const rolesPermissionService = new RolesPermissionService();

// Create (Assign permissions to a role)
exports.create = catchAsync(async (req, res) => {
	const result = await rolesPermissionService.create(req.body); // { roleId, permissionIds }

	res.status(201).json({
		status: true,
		message: 'Permissions assigned to role successfully',
		data: result,
	});
});

// Update (Reassign permissions to a role)
exports.update = catchAsync(async (req, res) => {
	const { id: roleId } = req.params; // roleId as param
	const updated = await rolesPermissionService.update(roleId, req.body); // { permissionIds }

	let message =
		Array.isArray(updated) && updated.length === 0
			? 'No permissions updated.'
			: 'Role permissions updated successfully';

	res.status(200).json({
		status: true,
		message,
		data: updated,
	});
});

// Delete (Remove all permissions for a role)
exports.destroy = catchAsync(async (req, res) => {
	const { id: roleId } = req.params;

	const deleted = await rolesPermissionService.delete(roleId);

	res.status(200).json({
		status: true,
		message: 'All permissions for the role deleted successfully',
		data: deleted,
	});
});

// Get all role-permission mappings
exports.getAll = catchAsync(async (req, res) => {
	const data = await rolesPermissionService.getAllRolePermissions();

	res.status(200).json({
		status: true,
		message: 'All role-permission mappings fetched successfully',
		data,
	});
});

// Get all permissions assigned to a role
exports.getByRoleId = catchAsync(async (req, res) => {
	const { id: roleId } = req.params;

	const rolePermissions = await rolesPermissionService.getPermissionsByRole(
		roleId
	);

	let message =
		rolePermissions?.length > 0
			? 'Permissions for the role fetched successfully'
			: 'No permissions found for the given role';

	res.status(200).json({
		status: true,
		message,
		data: rolePermissions,
	});
});
