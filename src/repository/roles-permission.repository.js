const { RolesPermissions, Role, Permission, Menu } = require('../models');

class RolesPermissionRepository {
	async create(data) {
		try {
			await RolesPermissions.destroy({ where: { roleId: data.roleId } });

			const rolePermissions = await Promise.all(
				data.permissionIds.map((permissionId) =>
					RolesPermissions.create({ roleId: data.roleId, permissionId })
				)
			);
			return rolePermissions;
		} catch (error) {
			throw error;
		}
	}

	async update(id, data) {
		try {
			// Delete old and re-create
			await RolesPermissions.destroy({ where: { roleId: data.roleId } });

			const updated = await Promise.all(
				data.permissionIds.map((permissionId) =>
					RolesPermissions.create({ roleId: data.roleId, permissionId })
				)
			);

			return updated;
		} catch (error) {
			throw error;
		}
	}

	async delete(roleId) {
		try {
			const deleted = await RolesPermissions.destroy({ where: { roleId } });
			return deleted;
		} catch (error) {
			throw error;
		}
	}

	async allRolePermissions() {
		try {
			const all = await RolesPermissions.findAll({
				attributes: ['id'],
				include: [
					{ model: Role, as: 'role' },
					{
						model: Permission,
						as: 'permission',
						include: [{ model: Menu, as: 'menu' }],
					},
				],
			});
			return all;
		} catch (error) {
			throw error;
		}
	}

	async getPermissionsByRoleId(roleId) {
		try {
			const data = await RolesPermissions.findAll({
				where: { roleId },
				include: ['permission'], // Must match defined association alias
			});

			console.log(`getPermissionsByRoleId ${roleId}`, data);

			if (!Array.isArray(data) || data.length === 0) {
				return [];
			}

			// Flatten and extract permission IDs
			const permissionIds = data
				.map((entry) => entry.permission?.id) // use optional chaining in case it's missing
				.filter(Boolean); // remove undefined/null values

			return {roleId, permissionIds};
		} catch (error) {
			throw error;
		}
	}
}

module.exports = RolesPermissionRepository;
