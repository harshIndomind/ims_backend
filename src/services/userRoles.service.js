'use strict';

const { sequelize, Role } = require('../models/index');
const { userRoleRepo } = require('../repository/index');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

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
    // const {role, org_id} = req.user;
    // let roleWhereClause = {};
    // let orgWhereClause = {};
	// if (role !== 'Super Admin') {
	// 	roleWhereClause = { id: { [Op.notIn]: [1, 2] } };
    //     orgWhereClause = {id: org_id}
	// }
	// console.log({roleWhereClause, orgWhereClause});

	logger.debug('getAllUsersWithRoles Request', { user: req.user });

	const { org_id, roles } = req.user;

	logger.debug("roles ", {roles})
	const isSuperAdmin = roles.includes('super_admin');
	const isAdmin = roles.includes('org_admin');

	const excludedCodes = isSuperAdmin
		? ['super_admin']
		: ['super_admin', 'org_admin'];

	// Step 1 — get excluded role IDs from codes
	const excludedRoles = await Role.findAll({
		where: { code: { [Op.in]: excludedCodes } },
		attributes: ['id'],
	});
	const excludedRoleIds = excludedRoles.map((r) => r.id);
	logger.debug('excludedRoleIds', { excludedRoleIds });

	if (!excludedRoleIds.length) {
		return await userRoleRepo.findAllUsersWithRoles({});
	}

	// Step 2 — get user IDs to exclude
	const excludedUsers = await sequelize.query(
		`SELECT user_id FROM user_roles WHERE role_id IN (:roleIds)`,
		{
			replacements: { roleIds: excludedRoleIds },
			type: sequelize.QueryTypes.SELECT,
		},
	);
	const excludedUserIds = excludedUsers.map((u) => u.user_id);
	
	logger.debug('excludedUserIds', { excludedUserIds });

	let roleWhereClause = {};
	let orgWhereClause = {};
	if (isAdmin) {
		roleWhereClause = { id: { [Op.notIn]: excludedRoleIds } };
		orgWhereClause = { id: org_id };
	}
	logger.debug("roleWhereClause, orgWhereClause ", { roleWhereClause, orgWhereClause });
	
	return userRoleRepo.findAllUsersWithRoles(roleWhereClause, orgWhereClause);
};

module.exports = {
	assignRolesToUser,
	updateUserRoles,
	getUserWithRoles,
	getAllUsersWithRoles,
};
