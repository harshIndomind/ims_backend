const { Role } = require('../models/index');
class RoleRepository {
	async create(data) {
		try {
			const role = await Role.create(data);
			return role;
		} catch (error) {
			throw error;
		}
	}
	async update(id, data) {
		try {
			const [affectedCount] = await Role.update(data, { where: { id } });

			return affectedCount;
		} catch (error) {
			throw error;
		}
	}
	async delete(id) {
		try {
			const role = await Role.destroy({ where: { id } });
			return role;
		} catch (error) {
			throw error;
		}
	}
	async allRoles(data) {
		try {
			const roles = await Role.findAll();
			return roles;
		} catch (error) {
			throw error;
		}
	}
	async roleById(id) {
		try {
			const role = await Role.findOne({ where: { id } });
			return role;
		} catch (error) {
			throw error;
		}
	}
}

module.exports = RoleRepository;
