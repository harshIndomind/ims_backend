const { RoleService } = require('../services/index');
const catchAsync = require('../utils/catchAsync');
const roleService = new RoleService();
const {
	RoleMenus,
	Role,
	Menu,
	RolePermission,
	sequelize,
	UserRole,
} = require('../models/index');
const { permissionCache } = require('../cache/permissionCache');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

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

		const role = await Role.findByPk(roleId, {
			include: {
				model: Menu,
				as: 'menus',
				attributes: ['id'],
				through: { attributes: [] },
			},
		});

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
	logger.debug('Role Id in Save Role Permissions: ', { roleId, permissions });

	if (!Array.isArray(permissions)) {
		return res.status(400).json({ message: 'permissions must be an array' });
	}

	const isSuperAdmin = req.user?.roles?.includes('super_admin');
	let callerPermIds = null;

	if (!isSuperAdmin) {
		// 1. Resolve caller's minimum role level
		const callerRoles = await Role.findAll({
			where: { code: { [Op.in]: req.user.roles ?? [] } },
			attributes: ['level'],
		});
		if (!callerRoles.length) {
			return res.status(403).json({ message: 'Cannot determine your role level' });
		}
		const callerMinLevel = Math.min(...callerRoles.map((r) => r.level));

		// 2. Target role must have a strictly higher level than the caller
		const targetRole = await Role.findByPk(roleId, { attributes: ['level', 'code'] });
		if (!targetRole) {
			return res.status(404).json({ message: 'Role not found' });
		}
		if (targetRole.level <= callerMinLevel) {
			return res.status(403).json({
				message: 'Cannot modify permissions for a role at or above your own level',
			});
		}

		// 3. Get caller's permission set — used for delegation check and scoped destroy
		const callerPermRows = await sequelize.query(
			`SELECT DISTINCT rp.permission_id AS id
			 FROM user_roles ur
			 JOIN role_permissions rp ON rp.role_id = ur.role_id
			 WHERE ur.user_id = ?`,
			{ replacements: [req.user.id], type: sequelize.QueryTypes.SELECT },
		);
		callerPermIds = new Set(callerPermRows.map((r) => r.id));

		// 4. Every requested permission must be in caller's own set
		const unauthorized = permissions.filter((id) => !callerPermIds.has(id));
		if (unauthorized.length > 0) {
			return res.status(403).json({
				message: 'Cannot grant permissions you do not hold',
			});
		}
	}

	const transaction = await sequelize.transaction();

	try {
		if (isSuperAdmin) {
			await RolePermission.destroy({ where: { role_id: roleId }, transaction });
		} else {
			// Scoped destroy: only remove permissions within caller's scope so that
			// permissions granted by higher-level users are preserved.
			await RolePermission.destroy({
				where: {
					role_id: roleId,
					permission_id: { [Op.in]: [...callerPermIds] },
				},
				transaction,
			});
		}

		const rows = permissions.map((permissionId) => ({
			role_id: roleId,
			permission_id: permissionId,
		}));

		if (rows.length > 0) {
			await RolePermission.bulkCreate(rows, { transaction });
		}

		await transaction.commit();

		const userRoles = await UserRole.findAll({
			where: { role_id: roleId },
			attributes: ['user_id'],
		});

		userRoles.forEach((ur) => {
			permissionCache.delete(ur.user_id);
		});

		res.json({ message: 'Role permissions saved successfully' });
	} catch (error) {
		await transaction.rollback();
		logger.error('Failed to save role permissions', { error });
		res.status(500).json({ message: 'Failed to save role permissions' });
	}
};

exports.getRolePermissions = async (req, res) => {
	const roleId = req.params.id;

	try {
		const rows = await RolePermission.findAll({
			where: { role_id: roleId },
			attributes: ['permission_id'],
		});

		let permissionIds = rows.map((r) => r.permission_id);

		if (!req.user?.roles?.includes('super_admin')) {
			const callerPermRows = await sequelize.query(
				`SELECT DISTINCT rp.permission_id AS id
				 FROM user_roles ur
				 JOIN role_permissions rp ON rp.role_id = ur.role_id
				 WHERE ur.user_id = ?`,
				{ replacements: [req.user.id], type: sequelize.QueryTypes.SELECT },
			);
			const callerPermIds = new Set(callerPermRows.map((r) => r.id));
			permissionIds = permissionIds.filter((id) => callerPermIds.has(id));
		}

		res.json(permissionIds);
	} catch (error) {
		console.error(error);
		res.status(500).json({
			message: 'Failed to fetch role permissions',
		});
	}
};
