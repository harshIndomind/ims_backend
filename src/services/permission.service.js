const { PermissionRepository } = require('../repository/index');

class PermissionService {
	constructor() {
		this.permissionRepository = new PermissionRepository();
	}

	async create(data) {
		const role = await this.permissionRepository.create(data);
		return role;
	}

	async update(id, data) {
		const roleUpdate = await this.permissionRepository.update(id, data);
		return roleUpdate;
	}

	async delete(id) {
		const role = await this.permissionRepository.delete(id);
		return role;
	}

	async getAllPermissions() {
		const roles = await this.permissionRepository.allPermissions();
		return roles;
	}

	async getPermissionById(id) {
		const role = await this.permissionRepository.permissionById(id);
		return role;
	}
}

module.exports = PermissionService;
