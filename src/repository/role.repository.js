const { where } = require('sequelize');
const { Role, User } = require('../models/index');
const { Op } = require('sequelize');
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
	async allRoles(id) {
		try {			
			const user = await User.findOne({ where: { id }, include: [{ model: Role, attributes: ['id', 'name'] }] });
			
			if (user && user.Role && user.Role.name === 'Admin') {
				const roles = await Role.findAll({where: { name: { [Op.notIn]: ['Admin', 'Super Admin'] } }});
				console.log("user.Role.name: ",roles);
				console.log("Roles: ",roles);
				
				return roles;
			}
			
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
