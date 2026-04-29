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
const {Op} = require('sequelize');

const createUser = async (payload, app_ids, transaction) => {
	const user = await User.create(payload, { transaction });

	if (app_ids && app_ids.length > 0) {
		await UserApp.bulkCreate(
			app_ids.map((appId) => ({
				user_id: user.id,
				app_id: appId,
			})),
			{
				transaction,
				ignoreDuplicates: true,
			}
		);
	}

	return user;
};


// const findAll = async (org_id, limit, offset, role_id) => {
const findAll = async (options = {}) => {
	return await User.findAndCountAll(options);
	let whereClauseForRoleId = {roleId: role_id};
	if(!role_id){
		whereClauseForRoleId.roleId = {[Op.notIn]: [1,2]};
	}
	console.log("whereClauseForRoleId ", whereClauseForRoleId);
	
	return await User.findAndCountAll({
		where: { org_id, ...whereClauseForRoleId },
		include: [
			{ model: Department, attributes: ['id', 'name', 'description'] },
			{ model: Designation, attributes: ['id', 'title'] },
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
        attributes: {exclude: ['password']},
		limit,
		offset,
	});
};

const findByEmail = async (email) => {
	return await User.findOne({ where: { email } });
};

const findById = async (id) => {
	const user = await User.findByPk(id, {
		include: [
			{ model: Department, attributes: ['id', 'name', 'description'] },
			{ model: Designation, attributes: ['id', 'title'] },
			{
				model: organization,
				as: 'organization',
				attributes: ['id', 'org_name'],
			},
			// {
			// 	model: App,
			// 	as: 'apps',
			// 	through: { attributes: ['id'] },
			// },
		],
		attributes: { exclude: ['password'] },
	});

	const appIds = [...new Set(user.apps?.map((app) => app.id) || [])];

	return { ...user.toJSON(), app_ids: appIds };
};

const update = async (id, data, app_ids) => {
	const t = await sequelize.transaction();
	const user = await User.update(data, { where: { id }, transaction: t });
	console.log('app_ids ', app_ids);

	if (app_ids?.length) {
		await UserApp.destroy({
			where: { user_id: id },
			transaction: t,
		});

		await UserApp.bulkCreate(
			app_ids.map((appId) => ({
				user_id: id,
				app_id: appId,
			})),
			{ transaction: t, ignoreDuplicates: true },
		);
	}
	await t.commit();
	return user;
};

const deleteById = async (id) => {
	return await User.destroy({ where: { id } });
};

module.exports = {
	createUser,
	findByEmail,
	findById,
	update,
	deleteById,
	findAll,
};
