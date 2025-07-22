const { PermissionRepository } = require('../repository/index');

class PermissionService {
	constructor() {
		this.permissionRepository = new PermissionRepository();
	}

	async create(data) {
		try {
			const role = await this.permissionRepository.create(data);
			return role;
		} catch (error) {
			throw error;
		}
	}

	async update(id, data) {
		try {
			const roleUpdate = await this.permissionRepository.update(id, data);

			return roleUpdate;
		} catch (error) {
			return error;
		}
	}

	async delete(id) {
		try {
			const role = await this.permissionRepository.delete(id);
			return role;
		} catch (error) {
			return error;
		}
	}

	async getAllPermissions(data) {
		try {
			const roles = await this.permissionRepository.allPermissions();
			return roles;
		} catch (error) {
			return error;
		}
	}

	async getPermissionById(id) {
		try {
			const role = await this.permissionRepository.permissionById(id);
			return role;
		} catch (error) {
			return error;
		}
	}
}

module.exports = PermissionService;
