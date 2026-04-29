'use strict';

const { User, Role, UserRole, organization } = require('../models');

const deleteByUserId = async (user_id, transaction = null) => {
	return UserRole.destroy({
		where: { user_id },
		transaction,
	});
};

const bulkCreate = async (user_id, roles, transaction = null) => {
	const payload = roles.map((role_id) => ({
		user_id,
		role_id,
	}));

	return UserRole.bulkCreate(payload, { transaction });
};

const findByUserId = async (user_id) => {
	return User.findOne({
		where: { id: user_id },
		include: [
			{
				model: Role,
				as: 'userRoles',
				through: {
					attributes: [], // hides UserRole table
				},
                attributes: ['id']
			},
		],
        attributes: ['id']
	});
};

const findAllUsersWithRoles = async (roleWhereClause, orgWhereClause) => {
	return User.findAll({
		include: [
            {
                model: organization,
                as: 'organization',
                attributes: ['org_name'],
                where: orgWhereClause
            },
			{
				model: Role,
				// as: 'roles',
				as: 'userRoles',
				through: { attributes: [] },
                attributes: ['id', 'name', 'code'],
                where: roleWhereClause
			},
		],
        attributes: ['id', 'name', 'email']
	});
};

module.exports = {
	deleteByUserId,
	bulkCreate,
	findByUserId,
	findAllUsersWithRoles,
};
