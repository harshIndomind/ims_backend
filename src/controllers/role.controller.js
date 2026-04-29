const { RoleService } = require('../services/index');
const catchAsync = require('../utils/catchAsync');
const roleService = new RoleService();
const {
	RoleMenus,
	Role,
	Menu,
	RolePermission,
	sequelize,
	UserRole
} = require('../models/index');
const { permissionCache } = require('../cache/permissionCache');

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
	const roles = await roleService.getAllRoles(req);

	res.status(200).json({
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
		console.log('roleId => ', roleId);

		const role = await Role.findByPk(roleId, {
			include: {
				model: Menu,
				as: 'menus',
				attributes: ['id'],
				through: { attributes: [] }, // skip RoleMenus join table data
			},
		});
		console.log('getAssignedMenus => ', role);

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

exports.saveRolePermissions = async (req, res) => {
	const roleId = req.params.id;
	const { permissions } = req.body;

	if (roleId === '1') {
		return res.status(403).json({
			message: 'Cannot modify Super Admin permissions',
		});
	}

	// validation
	if (!Array.isArray(permissions)) {
		return res.status(400).json({
			message: 'permissions must be an array',
		});
	}

	const transaction = await sequelize.transaction();

	try {
		// 1️⃣ Remove existing permissions of role
		await RolePermission.destroy({
			where: { role_id: roleId },
			transaction,
		});

		// 2️⃣ Prepare new rows
		const rows = permissions.map((permissionId) => ({
			role_id: roleId,
			permission_id: permissionId,
		}));

		// 3️⃣ Insert new permissions
		if (rows.length > 0) {
			await RolePermission.bulkCreate(rows, { transaction });
		}

		await transaction.commit();

		const userRoles = await UserRole.findAll({
			where: { role_id: roleId },
			attributes: ['user_id'],
		});

		// 🧹 clear cache for affected users
		userRoles.forEach((ur) => {
			permissionCache.delete(ur.user_id);
		});

		res.json({
			message: 'Role permissions saved successfully',
		});
	} catch (error) {
		await transaction.rollback();
		console.error(error);

		res.status(500).json({
			message: 'Failed to save role permissions',
		});
	}
};

exports.getRolePermissions = async (req, res) => {
	const roleId = req.params.id;

	try {
		const rows = await RolePermission.findAll({
			where: { role_id: roleId },
			attributes: ['permission_id'],
		});

		const permissionIds = rows.map((r) => r.permission_id);

		res.json(permissionIds);
	} catch (error) {
		console.error(error);
		res.status(500).json({
			message: 'Failed to fetch role permissions',
		});
	}
};
