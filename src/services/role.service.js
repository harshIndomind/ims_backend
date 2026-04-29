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
			const isAdmin = roleCodes.includes('org_admin');
			const isSuperAdmin = roleCodes.includes('super_admin');
			logger.debug("isAdmin or  isSuperAdmin", {isAdmin, isSuperAdmin})

			if (isAdmin) {
				const roles = await this.roleRepository.findAll({
					where: {
						code: { [Op.notIn]: ['super_admin', 'org_admin'] },
					},
				});
				logger.debug("roles ", {roles})
				return roles;
			}

			const where = {};
			where.code = { [Op.notIn]: ['super_admin'] };

			if (isSuperAdmin) {
				return await this.roleRepository.findAll({
					where,
				});
			}

			where.code = { [Op.notIn]: ['super_admin', 'org_admin', 'app_admin'] };
			const roles = await this.roleRepository.findAll(id);
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
