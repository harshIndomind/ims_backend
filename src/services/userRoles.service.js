'use strict';

const { sequelize } = require('../models/index');
const { userRoleRepo } = require('../repository/index');
const { Op } = require('sequelize');

const assignRolesToUser = async (user_id, roles) => {
	const transaction = await sequelize.transaction();

	try {
		await userRoleRepo.deleteByUserId(user_id, transaction);
		const userRoles = await userRoleRepo.bulkCreate(
			user_id,
			roles,
			transaction,
		);

		await transaction.commit();
		return userRoles;
	} catch (error) {
		await transaction.rollback();
		throw error;
	}
};

const updateUserRoles = async (user_id, roles) => {
	// same logic, different intent (semantic clarity)
	return assignRolesToUser(user_id, roles);
};

const getUserWithRoles = async (user_id) => {
	const user = await userRoleRepo.findByUserId(user_id);

	if (!user) {
		return null;
	}

	const userData = user.get({ plain: true });

	const roleIds = userData.userRoles?.map((role) => role.id) || [];

	return {
		user_id: userData.id,
		role_ids: roleIds,
	};
};

const getAllUsersWithRoles = async (req) => {
    const {role, org_id} = req.user;
    let roleWhereClause = {};
    let orgWhereClause = {};
	if (role !== 'Super Admin') {
		roleWhereClause = { id: { [Op.notIn]: [1, 2] } };
        orgWhereClause = {id: org_id}
	}
	console.log({roleWhereClause, orgWhereClause});
	
	return userRoleRepo.findAllUsersWithRoles(roleWhereClause, orgWhereClause);
};

module.exports = {
	assignRolesToUser,
	updateUserRoles,
	getUserWithRoles,
	getAllUsersWithRoles,
};
