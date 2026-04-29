const bcrypt = require('bcrypt');
const AppError = require('../utils/AppError');
const { AdminUserRepository } = require('../repository/index');
const {
	User,
	organization,
	Department,
	Designation,
	sequelize,
	UserApp,
	App,
	Role
} = require('../models/index');
const logger = require('../utils/logger');
const {Op} = require('sequelize');

const createUserByOrganization = async (data, loggedInUser) => {
	const t = await sequelize.transaction();

	try {
		const existingUser = await AdminUserRepository.findByEmail(data.email);

		if (existingUser) {
			throw new AppError('Email already exists', 400);
		}

		const hashedPassword = await bcrypt.hash(data.password, 10);

		const payload = {
			org_id: loggedInUser.org_id,
			name: data.name,
			email: data.email,
			password: hashedPassword,
			roleId: data.role_id,
			layer: data.layer,
			employee_code: data.employee_code,
			department_id: data.department_id,
			designation_id: data.designation_id,
			is_active: data.active,
		};

		// Pass transaction
		const user = await AdminUserRepository.createUser(payload, data.app_ids, t);

		// If this fails → rollback will happen
		// await createAdminUserInSCMService({
		// 	...payload,
		// 	password: data.password,
		// 	swayamm_user_id: user.id,
		// });

		await t.commit();

		return user;
	} catch (error) {
		await t.rollback();
		throw error;
	}
};

const getAllOrgAdminUsers = async (req) => {
	logger.debug('getAllOrgAdminUsers user payload: ', {user: req.user});

	const {org_id, role} = req.user;
	const limit = parseInt(req.query.limit) || 10;
	const offset = parseInt(req.query.offset) || 0;
	const role_id = parseInt(req.query.selectedRoleId) || 0;
	
	const where = {org_id};
	if(role === 'Super Admin'){
		delete where.org_id;
	}

	where['roleId'] = role_id;
	if (!role_id) {
		where['roleId'] = { [Op.notIn]: [1, 2] };
	}
	logger.debug('getAllOrgAdminUsers where payload: ', {where});
	options = {
		where,
		include: [
			{ model: Department, attributes: ['id', 'name', 'description'], required: false },
			{ model: Designation, attributes: ['id', 'title'], required: false },
			{
				model: organization,
				as: 'organization',
				attributes: ['id', 'org_name'],
			},
			{
				model: Role,
				attributes: ['id', 'name'],
			},
		],
		attributes: { exclude: ['password'] },
		limit,
		offset,
	};
	return await AdminUserRepository.findAll(options);
	// let whereClauseForRoleId = { roleId: role_id };
	// if (!role_id) {
	// 	whereClauseForRoleId.roleId = { [Op.notIn]: [1, 2] };
	// }
	// console.log('whereClauseForRoleId ', whereClauseForRoleId);

	// return await User.findAndCountAll({
	// 	where: { org_id, ...whereClauseForRoleId },
	// 	include: [
	// 		{ model: Department, attributes: ['id', 'name', 'description'] },
	// 		{ model: Designation, attributes: ['id', 'title'] },
	// 		{
	// 			model: organization,
	// 			as: 'organization',
	// 			attributes: ['id', 'org_name'],
	// 		},
	// 		{
	// 			model: Role,
	// 			attributes: ['id', 'name'],
	// 		},
	// 	],
	// 	attributes: { exclude: ['password'] },
	// 	limit,
	// 	offset,
	// });
};

const findOne = async (userId) => {
	const user = await AdminUserRepository.findById(userId);
	if (!user) {
		throw new AppError('User not found', 404);
	}
	return user;
};

const update = async (userId, data) => {
	const user = await AdminUserRepository.findById(userId);
	if (!user) {
		throw new AppError('User not found', 404);
	}

	if (data.email && data.email !== user.email) {
		const existingUser = await AdminUserRepository.findByEmail(data.email);
		if (existingUser) {
			throw new AppError('Email already exists', 400);
		}
	}

	const payload = {
		name: data.name,
		email: data.email,
		layer: data.layer,
		employee_code: data.employee_code,
		department_id: data.department_id,
		designation_id: data.designation_id,
		is_active: data.active,
		roleId: data.role_id,
	};

	if (data.password) {
		payload.password = await bcrypt.hash(data.password, 10);
	}

	return await AdminUserRepository.update(userId, payload, data.app_ids);
};

const remove = async (userId) => {
	const user = await AdminUserRepository.findById(userId);
	if (!user) {
		throw new AppError('User not found', 404);
	}

	return await AdminUserRepository.deleteById(userId);
};

module.exports = {
	createUserByOrganization,
	getAllOrgAdminUsers,
	findOne,
	update,
	remove,
};
