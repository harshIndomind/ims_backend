const {RolesPermissionRepository} = require('../repository/index');

class RolesPermissionService {
	constructor() {
		this.rolePermissionRepository = new RolesPermissionRepository();
	}

	async create(data) {
		try {
			const result = await this.rolePermissionRepository.create(data);
			return result;
		} catch (error) {
			throw error;
		}
	}

	async update(roleId, data) {
		try {
			const updated = await this.rolePermissionRepository.update(roleId, data);
			return updated;
		} catch (error) {
			throw error;
		}
	}

	async delete(roleId) {
		try {
			const deleted = await this.rolePermissionRepository.delete(roleId);
			return deleted;
		} catch (error) {
			throw error;
		}
	}

	async getAllRolePermissions() {
		try {
			const all = await this.rolePermissionRepository.allRolePermissions();
			return all;
		} catch (error) {
			throw error;
		}
	}

	async getPermissionsByRole(roleId) {
		try {
			const rolePerms = await this.rolePermissionRepository.getPermissionsByRoleId(roleId);
			return rolePerms;
		} catch (error) {
			throw error;
		}
	}
}

module.exports = RolesPermissionService;
