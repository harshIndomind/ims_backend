const { RoleRepository } = require('../repository/index');

class RoleService {
	constructor() {
		this.roleRepository = new RoleRepository();
	}

	async create(data) {
		try {
			const role = await this.roleRepository.create(data);
			return role;
		} catch (error) {
			throw error;
		}
	}

	async update(id, data) {
		try {
			const roleUpdate = await this.roleRepository.update(id, data);

			return roleUpdate;
		} catch (error) {
			return error;
		}
	}

	async delete(id) {
		try {
			const role = await this.roleRepository.delete(id);
			return role;
		} catch (error) {
			return error;
		}
	}

	async getAllRoles(id) {
		try {
			const roles = await this.roleRepository.allRoles(id);
			return roles;
		} catch (error) {
			return error;
		}
	}

	async getRoleById(id) {
		try {
			const role = await this.roleRepository.roleById(id);
			return role;
		} catch (error) {
			return error;
		}
	}
}

module.exports = RoleService;
