// vcp-service/src/events/handlers/userHandler.js

const bcrypt = require('bcrypt');
const {
	User,
	Role,
	UserRole,
	Department,
	Designation,
	MasterUnit,
	sequelize,
	organization,
} = require('../../models');
const logger = require('../../utils/logger');
const AppError = require('../../utils/AppError');
const { APP_CODE } = require('../../config/serverConfig');

// department_id/designation_id/unit_id are local-only primary keys — auth-service's
// event carries the cross-service uuid instead, which we resolve to our local ids here.
async function resolveDeptDesigIds(department_uuid, designation_uuid, unit_uuid) {
	const [dept, desig, unit] = await Promise.all([
		department_uuid
			? Department.findOne({ where: { uuid: department_uuid }, attributes: ['id'] })
			: null,
		designation_uuid
			? Designation.findOne({ where: { uuid: designation_uuid }, attributes: ['id'] })
			: null,
		unit_uuid
			? MasterUnit.findOne({ where: { uuid: unit_uuid }, attributes: ['id'] })
			: null,
	]);

	if (department_uuid && !dept) {
		logger.warn(`${APP_CODE}: department not found for uuid`, { department_uuid });
	}
	if (designation_uuid && !desig) {
		logger.warn(`${APP_CODE}: designation not found for uuid`, { designation_uuid });
	}
	if (unit_uuid && !unit) {
		logger.warn(`${APP_CODE}: unit not found for uuid`, { unit_uuid });
	}

	return {
		department_id: dept?.id ?? null,
		designation_id: desig?.id ?? null,
		unit_id: unit?.id ?? null,
	};
}

async function handleUserCreated(data) {
	const t = await sequelize.transaction();
	try {
		logger.info('Event: User Created | data :', { data });

		const org = await organization.findOne({
			where: { uuid: data.org_uuid },
			attributes: ['id'],
		});

		if (!org) {
			throw new AppError('Organization not found.');
		}

		const { department_id, designation_id, unit_id } = await resolveDeptDesigIds(
			data.department_uuid,
			data.designation_uuid,
			data.unit_uuid,
		);

		// Upsert user — safe to run multiple times
		const [user, created] = await User.upsert(
			{
				// id:              data.auth_user_id,   // Auth id = PK
				uuid: data.uuid,
				swayamm_user_id: data.auth_user_id,
				email: data.email,
				name: data.name,
				password: data.password,
				org_id: org.id,
				is_active: data.is_active,
				employee_code: data.employee_code,
				department_id,
				designation_id,
				unit_id,
				layer: data.layer,
				image: data.image,
				logo: data.logo,
			},
			{ transaction: t },
		);

		// Assign SCM-specific roles only
		const scmRoles = data.roles?.[APP_CODE] ?? [];
		logger.info('Event: User Created | Roles :', { roles: data.roles });
		if (scmRoles.length) {
			// Remove existing roles first — full replacement
			// await UserRole.destroy({
			//   where:       { user_id: data.auth_user_id },
			//   transaction: t,
			// });

			for (const roleCode of scmRoles) {
				const role = await Role.findOne({
					where: { code: roleCode },
				});
				if (role) {
					await UserRole.create(
						{
							user_id: user.id,
							role_id: role.id,
							assigned_at: new Date(),
						},
						{ transaction: t },
					);
				} else {
					logger.warn(`Role not found in ${APP_CODE}: ${roleCode}`);
				}
			}
		}

		await t.commit();
		logger.info(`User synced to ${APP_CODE}`, {
			auth_user_id: data.auth_user_id,
		});
	} catch (err) {
		await t.rollback();
		throw err; // rethrow — consumer will nack
	}
}

async function handleUserUpdated(data) {
	const t = await sequelize.transaction();
	try {
		logger.info('Event: User Updated | data :', { data });

		const user = await User.findOne({
			where: { uuid: data.uuid },
			transaction: t,
		});

		if (!user) {
			logger.warn(`User not found in ${APP_CODE} for update`, { uuid: data.uuid });
			await t.rollback();
			return;
		}

		const { department_id, designation_id, unit_id } = await resolveDeptDesigIds(
			data.department_uuid,
			data.designation_uuid,
			data.unit_uuid,
		);

		await User.update(
			{
				email: data.email,
				name: data.name,
				is_active: data.is_active,
				employee_code: data.employee_code,
				department_id,
				designation_id,
				unit_id,
			},
			{ where: { uuid: data.uuid }, transaction: t },
		);

		// Assign SCM-specific roles only
		const scmRoles = data.roles?.[APP_CODE] ?? [];
		logger.info('Event: User Updated | Roles :', { roles: data.roles });
		if (scmRoles.length) {
			// Remove existing roles first — full replacement
			// await UserRole.destroy({
			//   where:       { user_id: user.id },
			//   transaction: t,
			// });

			for (const roleCode of scmRoles) {
				const role = await Role.findOne({
					where: { code: roleCode },
				});
				if (role) {
					await UserRole.create(
						{
							user_id: user.id,
							role_id: role.id,
							assigned_at: new Date(),
						},
						{ transaction: t },
					);
				} else {
					logger.warn(`Role not found in ${APP_CODE}: ${roleCode}`);
				}
			}
		}

		await t.commit();
		logger.info(`User updated in ${APP_CODE}`, { uuid: data.uuid });
	} catch (err) {
		await t.rollback();
		throw err;
	}
}

async function handlePasswordChanged(data) {
	// Only update password — nothing else
	await User.update(
		{ password: data.password },
		{ where: { uuid: data.uuid } },
	);
	logger.info(`Password synced in ${APP_CODE}`, { uuid: data.uuid });
}

async function handleUserRolesUpdated(data) {
	const t = await sequelize.transaction();
	try {
		const scmRoles = data.roles?.[APP_CODE];
		if (scmRoles === undefined) {
			await t.rollback();
			return;
		}

		const user = await User.findOne({
			where: { uuid: data.uuid },
			transaction: t,
		});
		if (!user) {
			logger.warn(`User not found in ${APP_CODE} for role update`, {
				uuid: data.uuid,
			});
			await t.rollback();
			return;
		}

		// Full role replacement
		await UserRole.destroy({
			where: { user_id: user.id },
			transaction: t,
		});

		for (const roleCode of scmRoles) {
			const role = await Role.findOne({ where: { code: roleCode } });
			if (role) {
				await UserRole.create(
					{
						user_id: user.id,
						role_id: role.id,
						assigned_at: new Date(),
					},
					{ transaction: t },
				);
			}
		}

		await t.commit();
		logger.info(`Roles synced in ${APP_CODE}`, { uuid: data.uuid });
	} catch (err) {
		await t.rollback();
		throw err;
	}
}

async function handleUserDeactivated(data) {
	await User.update({ is_active: 0 }, { where: { uuid: data.uuid } });
	logger.info(`User deactivated in ${APP_CODE}`, { uuid: data.uuid });
}

async function handleUserActivated(data) {
	await User.update({ is_active: 1 }, { where: { uuid: data.uuid } });
	logger.info(`User activated in ${APP_CODE}`, { uuid: data.uuid });
}

const VCP_ONLY_ROLES = ['vendor', 'vendor_customer', 'customer'];

async function handleUserProfileUpdated(data) {
	if (data.roles?.some((r) => VCP_ONLY_ROLES.includes(r))) {
		logger.info('Skipping profile update — VCP-only user not present in SCM', {
			uuid: data.uuid,
		});
		return;
	}
	logger.info('handleUserProfileUpdated ', { data });
	const updateFields = { name: data.name, password: data.password };
	if (data.image !== undefined) updateFields.image = data.image;
	if (data.logo !== undefined) updateFields.logo = data.logo;

	await User.update(updateFields, { where: { uuid: data.uuid } });
	logger.info(`User profile synced in ${APP_CODE}`, { uuid: data.uuid });
}

module.exports = {
	handleUserCreated,
	handleUserUpdated,
	handlePasswordChanged,
	handleUserRolesUpdated,
	handleUserDeactivated,
	handleUserActivated,
	handleUserProfileUpdated,
};
