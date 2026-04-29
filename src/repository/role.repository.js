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

	async findAll(options = {}) {
		try {
			return await Role.findAll(options);
		} catch (error) {
			throw error;
		}
	}

	// async findAll(id) {
	// 	const user = await User.findOne({
	// 		where: { id },
	// 		include: [
	// 			{
	// 				model: Role,
	// 				as: 'roles',
	// 				through: { attributes: [] }, // ← exclude junction table fields
	// 				attributes: ['id', 'name', 'code'],
	// 			},
	// 		],
	// 	});

	// 	if (!user) throw new AppError('User not found', 404);

	// 	const roleCodes = user.roles.map((r) => r.code);
	// 	const isAdmin = roleCodes.includes('org_admin');
	// 	const isSuperAdmin = roleCodes.includes('super_admin');

	// 	// Org Admin — cannot see Super Admin or other Org Admin roles
	// 	if (isAdmin) {
	// 		return await Role.findAll({
	// 			where: {
	// 				code: { [Op.notIn]: ['super_admin', 'org_admin'] },
	// 			},
	// 		});
	// 	}

	// 	// Super Admin — sees all roles
	// 	if (isSuperAdmin) {
	// 		return await Role.findAll();
	// 	}

	// 	// Anyone else — return empty or throw
	// 	throw new AppError('Not authorized to view roles', 403);
	// }
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
