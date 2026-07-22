const { RoleRepository } = require('../repository/index');
const { User, Role } = require('../models/index');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
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

	async getAllRoles(req) {
		try {
			const { roles: roleCodes } = req.user;

			// super_admin sees every role except other super_admins (level > 0)
			if (roleCodes.includes('super_admin')) {
				return await this.roleRepository.findAll({
					where: { level: { [Op.gt]: 0 } },
				});
			}

			// All other callers: return only roles whose level is strictly greater
			// than the caller's minimum level (cannot manage peers or superiors)
			const callerRoles = await Role.findAll({
				where: { code: { [Op.in]: roleCodes } },
				attributes: ['level'],
			});
			if (!callerRoles.length) return [];

			const callerMinLevel = Math.min(...callerRoles.map((r) => r.level));

			return await this.roleRepository.findAll({
				where: { level: { [Op.gt]: callerMinLevel } },
			});
		} catch (error) {
			throw error;
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
