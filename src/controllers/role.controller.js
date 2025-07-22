const { RoleService } = require('../services/index');
const catchAsync = require('../utils/catchAsync');
const roleService = new RoleService();
const { RoleMenus, Role, Menu } = require('../models/index');

exports.create = catchAsync(async (req, res) => {
	const role = await roleService.create(req.body);

	res.status(201).json({
		status: true,
		message: 'Role created successfully',
		data: role,
	});
});

exports.update = catchAsync(async (req, res) => {
	const { id } = req.params;
	const role = await roleService.update(id, req.body);

	let message = role == 0 ? 'Nothing to update.' : 'Role updated successfully';
	res.status(201).json({
		status: true,
		message: message,
		data: role,
	});
});

exports.destory = catchAsync(async (req, res) => {
	const { id } = req.params;

	const role = await roleService.delete(id);

	res.status(201).json({
		status: true,
		message: 'Role deleted successfully',
		data: role,
	});
});

exports.getAllRoles = catchAsync(async (req, res) => {
	const roles = await roleService.getAllRoles();

	res.status(201).json({
		status: true,
		message: 'Roles fetched successfully',
		data: roles,
	});
});

exports.getRoleById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const role = await roleService.getRoleById(id);
	let message = role ? 'A Role fetched successfully' : 'Role not found';
	res.status(201).json({
		status: true,
		message: message,
		data: role,
	});
});

exports.assignRoleMenus = catchAsync(async (req, res) => {
	try {
		const { roleId, menuIds } = req.body;

		// Remove old
		await RoleMenus.destroy({ where: { roleId } });

		// Add new
		const records = menuIds.map((menuId) => ({
			roleId,
			menuId,
		}));

		await RoleMenus.bulkCreate(records);

		res.status(201).json({
			status: true,
			message: 'Menus assigned successfully',
			data: null,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

exports.getAssignedMenus = async (req, res) => {
	try {
		const { roleId } = req.params;
		console.log("roleId => ", roleId);
		
		const role = await Role.findByPk(roleId, {
			include: {
				model: Menu,
				as: 'menus',
				attributes: ['id'],
				through: { attributes: [] }, // skip RoleMenus join table data
			},
		});
		console.log("getAssignedMenus => ", role);

		if (!role) {
			return res.status(404).json({ message: 'Role not found' });
		}

		const menuIds = role.menus.map((menu) => menu.id);
		return res.json({ data: menuIds });
	} catch (error) {
		console.error('Error fetching role menus:', error);
		return res.status(500).json({ message: 'Server error' });
	}
};
