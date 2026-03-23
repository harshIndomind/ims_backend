const bcrypt = require('bcrypt');
const AppError = require('../utils/AppError');
const { AdminUserRepository } = require('../repository/index');
const {sequelize} = require('../models/index');

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


const getAllOrgAdminUsers = async (org_id, limit, offset, role_id) => {
	return await AdminUserRepository.findAll(org_id, limit, offset, role_id);
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
