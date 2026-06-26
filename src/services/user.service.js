const { UserRepository: userRepo } = require('../repository/index');
const {
	organization,
	Role,
	User,
	sequelize,
	Department,
	Designation,
} = require('../models/index');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('crypto');
const AppError = require('../utils/AppError');
const {
	s3,
	PutObjectCommand,
	DeleteObjectCommand,
	generateSignedUrl,
} = require('../utils/s3Bucket');
const { publishEvent } = require('../events/publisher');
const { buildUserCreatedEvent, buildUserUpdatedEvent, buildUserRolesUpdatedEvent,buildPasswordChangedEvent, buildUserProfileUpdatedEvent } = require('../events/schemas/userEvents');
const logger = require('../utils/logger');
class UserService {
	// ────────────────────────────────────────────────────────
	// CREATE USER
	// ────────────────────────────────────────────────────────
	async createUser(body, loggedInUserId) {
		const {
			org_id,
			name,
			email,
			password,
			employee_code,
			is_active = false,
			layer,
			unit_id,
			designation_id,
			department_id,
			app_access, // [{ app_code: 'SCM', role_code: 'budget_entry' }, ...]
		} = body;

		const org = await organization.findOne({ where: { id: org_id } });
		if (!org) throw new AppError('Organization not exists', 409);

		// ── Validation ──────────────────────────────────────────
		const existingUser = await userRepo.findByEmail(email);
		if (existingUser) throw new AppError('Email already exists', 409);

		if (employee_code) {
			const existingEmployeeCode = await userRepo.findByEmployeeCode(employee_code);
			if (existingEmployeeCode) throw new AppError('Employee Code already exists', 409);
		}

		if (!app_access?.length) {
			throw new AppError('At least one app access must be provided', 400);
		}

		// Validate all app_codes and role_codes exist before starting transaction
		// const resolvedAppRoles = await this._resolveAppRoles(app_access);

		const t = await sequelize.transaction();
		try {
			// ── Create user ───────────────────────────────────────
			const hashedPassword = await bcrypt.hash(password, 10);

			const user = await userRepo.create(
				{
					org_id,
					name,
					email,
					password: hashedPassword,
					employee_code,
					is_active: is_active ? 1 : 0,
					layer,
					unit_id,
					designation_id,
					department_id,
				},
				t,
			);

			// ── Assign AUTH role in user_roles ────────────────────
			// Determine AUTH role — org_admin takes priority
			const hasOrgAdmin = app_access.some((a) => a.role_code === 'org_admin');
			const authRoleCode = hasOrgAdmin ? 'org_admin' : app_access[0].role_code;

			const authRole = await userRepo.findRoleByCode(authRoleCode);
			if (authRole) {
				await userRepo.createUserRole(
					{
						user_id: user.id,
						role_id: authRole.id,
						assigned_by: loggedInUserId,
						assigned_at: new Date(),
					},
					t,
				);
			}

			// ── Assign user_application_roles ─────────────────────
			// for (const { app, role } of resolvedAppRoles) {
			// 	await userRepo.createUserApplicationRole(
			// 		{
			// 			user_id: user.id,
			// 			app_id: app.id,
			// 			role_code: role.code,
			// 			org_id,
			// 			status: true,
			// 			assigned_by: loggedInUserId,
			// 			assigned_at: new Date(),
			// 		},
			// 		t,
			// 	);
			// }

			await t.commit();

			// ── Publish sync event ────────────────────────────────
			const rolesMap = app_access.reduce((acc, { app_code, role_code }) => {
				acc[app_code] = [role_code];
				return acc;
			}, {});

			await publishEvent(
				'user.created',
				buildUserCreatedEvent(
					{ ...user.toJSON(), org_uuid: org.uuid, password: hashedPassword },
					rolesMap,
				),
			);

			logger.info('User created successfully', { userId: user.id, email });

			return {
				id: user.id,
				name: user.name,
				email: user.email,
			};
		} catch (err) {
			if (t && !t.finished) {
				await t.rollback();
			}
			throw err;
		}
	}

	// ────────────────────────────────────────────────────────
	// UPDATE USER
	// ────────────────────────────────────────────────────────
	async updateUser(id, body, loggedInUserId) {
		const {
			org_id,
			name,
			email,
			employee_code,
			is_active = false,
			layer,
			unit_id,
			designation_id,
			department_id,
			app_access,
		} = body;

		const org = await organization.findOne({ where: { id: org_id } });
		if (!org) throw new AppError('Organization not exists', 409);

		const user = await userRepo.findById(id);
		if (!user) throw new AppError('User not found', 404);

		// Check email uniqueness if changed
		if (email && email !== user.email) {
			const existing = await userRepo.findByEmail(email);
			if (existing) throw new AppError('Email already exists', 409);
		}

		// Check employee_code uniqueness if changed
		if (employee_code && employee_code !== user.employee_code) {
			const existingEmployeeCode = await userRepo.findByEmployeeCode(employee_code);
			if (existingEmployeeCode) throw new AppError('Employee Code already exists', 409);
		}

		// Validate app roles if provided
		// let resolvedAppRoles = [];
		// if (app_access?.length) {
		// 	resolvedAppRoles = await this._resolveAppRoles(app_access);
		// }

		const t = await sequelize.transaction();
		try {
			// ── Update user fields ────────────────────────────────
			await userRepo.update(
				id,
				{
					name,
					email,
					employee_code,
					is_active: is_active ? 1 : 0,
					layer,
					unit_id,
					designation_id,
					department_id,
				},
				t,
			);

			const user = await userRepo.findById(id);

			logger.info('User updated in SCM', { user });
			// ── Update app roles if provided ──────────────────────
			if (app_access?.length) {
				// Replace all existing app roles
				// await userRepo.destroyUserApplicationRoles(id, t);
				await userRepo.destroyUserRoles(id, t);

				// Re-assign AUTH role
				const hasOrgAdmin = app_access.some((a) => a.role_code === 'org_admin');
				const authRoleCode = hasOrgAdmin
					? 'org_admin'
					: app_access[0].role_code;
				const authRole = await userRepo.findRoleByCode(authRoleCode, 'AUTH');

				if (authRole) {
					await userRepo.createUserRole(
						{
							user_id: id,
							role_id: authRole.id,
							assigned_by: loggedInUserId,
							assigned_at: new Date(),
						},
						t,
					);
				}
			}

			await t.commit();

			// ── Publish sync events ───────────────────────────────
			await publishEvent(
				'user.updated',
				buildUserUpdatedEvent({
					id,
					uuid: user.uuid,
					org_uuid: org.uuid,
					name,
					email,
					employee_code,
					is_active: is_active ? 1 : 0,
				}),
			);

			if (app_access?.length) {
				const rolesMap = app_access.reduce((acc, { app_code, role_code }) => {
					acc[app_code] = [role_code];
					return acc;
				}, {});
				await publishEvent(
					'user.roles_updated',
					buildUserRolesUpdatedEvent(user.uuid, rolesMap),
				);
			}

			logger.info('User updated successfully', { userId: id });
			return { id, name, email };
		} catch (err) {
			await t.rollback();
			throw err;
		}
	}

	// ────────────────────────────────────────────────────────
	// UPDATE USER PROFILE (self — image / logo / name)
	// ────────────────────────────────────────────────────────
	async updateUserProfile(id, { name, password, image, logo }, roles = []) {
		const isOrgRole = roles.some((r) => ['org_admin', 'app_admin'].includes(r));

		const userData = await User.findByPk(id);
		if (!userData) throw new AppError('User not found', 404);

		const updateData = { name };

		if (password) {
			updateData.password = await bcrypt.hash(password, 10);
		}

		if (image) {
			if (userData.image) {
				await s3.send(
					new DeleteObjectCommand({
						Bucket: process.env.AWS_BUCKET_NAME,
						Key: userData.image,
					}),
				);
			}
			const fullPath = `server_uploads/profile/${generateUniqueFilename(image.originalname)}`;
			await s3.send(
				new PutObjectCommand({
					Bucket: process.env.AWS_BUCKET_NAME,
					Key: fullPath,
					Body: fs.createReadStream(image.path),
					ContentType: image.mimetype,
				}),
			);
			updateData.image = fullPath;
		}

		if (isOrgRole && logo) {
			if (userData.logo) {
				await s3.send(
					new DeleteObjectCommand({
						Bucket: process.env.AWS_BUCKET_NAME,
						Key: userData.logo,
					}),
				);
			}
			const fullPath = `server_uploads/company_logos/${generateUniqueFilename(logo.originalname)}`;
			await s3.send(
				new PutObjectCommand({
					Bucket: process.env.AWS_BUCKET_NAME,
					Key: fullPath,
					Body: fs.createReadStream(logo.path),
					ContentType: logo.mimetype,
				}),
			);
			updateData.logo = fullPath;
		}

		await userRepo.update(id, updateData);

		await publishEvent(
			'user.profile_updated',
			buildUserProfileUpdatedEvent(userData.uuid, updateData, roles),
		);

		const user = await userRepo.findById(id);
		const userObj = user.get({ plain: true });
		let imageUrl = null;
		if (userObj.image) {
			userObj.imageUrl = await generateSignedUrl(user.image);
		}

		return userObj;
	}

	// ────────────────────────────────────────────────────────
	// CHANGE PASSWORD
	// ────────────────────────────────────────────────────────
	async changePassword(userId, { oldPassword, newPassword }) {
		const user = await userRepo.findById(userId);
		if (!user) throw new AppError('User not found', 404);

		const isMatch = await bcrypt.compare(oldPassword, user.password);
		if (!isMatch) throw new AppError('Old password is incorrect', 400);

		const hashedPassword = await bcrypt.hash(newPassword, 10);

		await userRepo.update(userId, { password: hashedPassword });

		// Publish password change to all services
		await publishEvent(
			'user.password_changed',
			buildPasswordChangedEvent(user.uuid, hashedPassword),
		);

		logger.info('Password changed', { userId });
	}

	// ────────────────────────────────────────────────────────
	// DEACTIVATE USER
	// ────────────────────────────────────────────────────────
	async deactivateUser(userId) {
		const user = await userRepo.findById(userId);
		if (!user) throw new AppError('User not found', 404);

		await userRepo.update(userId, { is_active: 0 });

		await publishEvent('user.deactivated', {
			eventId: require('crypto').randomUUID(),
			eventType: 'user.deactivated',
			version: '1.0',
			timestamp: new Date().toISOString(),
			source: 'SCM',
			data: { user_uuid: user.uuid },
		});

		logger.info('User deactivated', { userId });
	}

	async activateUser(userId) {
		const user = await userRepo.findById(userId);
		if (!user) throw new AppError('User not found', 404);

		await userRepo.update(userId, { is_active: 1 });

		await publishEvent('user.activated', {
			eventId: require('crypto').randomUUID(),
			eventType: 'user.activated',
			version: '1.0',
			timestamp: new Date().toISOString(),
			source: 'SCM',
			data: { user_uuid: user.uuid },
		});

		logger.info('User activated', { userId });
	}

	async destroy(id) {
		try {
			const user = await userRepo.delete(id);

			return user;
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async getAllUsers(req) {
		try {
			const { org_id, roles } = req.user;
			const { is_active = null, search = null, limit, offset } = req.query;
			const isSuperAdmin = roles.includes('super_admin');

			const excludedCodes = isSuperAdmin
				? ['super_admin']
				: ['super_admin', 'org_admin'];

			const excludedRoles = await Role.findAll({
				where: { code: { [Op.in]: excludedCodes } },
				attributes: ['id'],
			});
			const excludedRoleIds = excludedRoles.map((r) => r.id);

			const excludedUsers = await sequelize.query(
				`SELECT user_id FROM user_roles WHERE role_id IN (:roleIds)`,
				{
					replacements: { roleIds: excludedRoleIds.length ? excludedRoleIds : [0] },
					type: sequelize.QueryTypes.SELECT,
				},
			);
			const excludedUserIds = excludedUsers.map((u) => u.user_id);

			const whereClause = {};

			if (excludedUserIds.length) {
				whereClause.id = { [Op.notIn]: excludedUserIds };
			}

			if (!isSuperAdmin) {
				whereClause.org_id = org_id;
			}

			if (is_active !== null && is_active !== '') {
				whereClause.is_active = is_active;
			}

			if (search) {
				whereClause[Op.or] = [
					{ name: { [Op.like]: `%${search}%` } },
					{ email: { [Op.like]: `%${search}%` } },
					{ employee_code: { [Op.like]: `%${search}%` } },
				];
			}

			const { count, rows } = await userRepo.findAndCountAll({
				where: whereClause,
				distinct: true,
				attributes: { exclude: ['password'] },
				include: [
					{
						model: Role,
						as: 'userRoles',
						through: { attributes: [] },
						attributes: ['code', 'name'],
					},
					{
						model: organization,
						as: 'organization',
						attributes: ['id', 'org_name', 'org_code'],
					},
					{
						model: Department,
						attributes: ['id', 'name'],
					},
					{
						model: Designation,
						attributes: ['id', 'title'],
					},
				],
				order: [['createdAt', 'DESC']],
				...(limit !== undefined && { limit: parseInt(limit) }),
				...(offset !== undefined && { offset: parseInt(offset) }),
			});

			return { users: rows, total: count };
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async getUserById(id) {
		try {
			const user = await User.findOne({
				where: { id },
				attributes: { exclude: ['password'] },
				include: [
					{
						model: Role,
						as: 'userRoles',
						through: { attributes: [] },
						attributes: ['id', 'code', 'name'],
					},
					{
						model: organization,
						as: 'organization',
						attributes: ['id', 'org_name', 'org_code'],
					},
					{
						model: Department,
						attributes: ['id', 'name'],
					},
					{
						model: Designation,
						attributes: ['id', 'title'],
					},
				],
			});

			if (!user) return null;

			const userJson = user.toJSON();
			// Map userRoles → appRoles format expected by the frontend form
			userJson.appRoles = (userJson.userRoles ?? []).map((r) => ({
				app_code: 'SCM',
				role_code: r.code,
			}));

			return userJson;
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async updateUserProfile(id, { name, password, image, logo }, roles = []) {
		try {
			const isOrgRole = roles.some((r) =>
				['org_admin', 'app_admin'].includes(r),
			);

			const userData = await User.findByPk(id);
			if (!userData) throw new AppError('User not found', 404);

			const updateData = { name };

			if (password) {
				updateData.password = await bcrypt.hash(password, 10);
			}

			if (image) {
				if (userData.image) {
					await s3.send(
						new DeleteObjectCommand({
							Bucket: process.env.AWS_BUCKET_NAME,
							Key: userData.image,
						}),
					);
				}
				const fullPath = `server_uploads/profile/${generateUniqueFilename(image.originalname)}`;
				await s3.send(
					new PutObjectCommand({
						Bucket: process.env.AWS_BUCKET_NAME,
						Key: fullPath,
						Body: fs.createReadStream(image.path),
						ContentType: image.mimetype,
					}),
				);
				updateData.image = fullPath;
			}

			if (isOrgRole && logo) {
				if (userData.logo) {
					await s3.send(
						new DeleteObjectCommand({
							Bucket: process.env.AWS_BUCKET_NAME,
							Key: userData.logo,
						}),
					);
				}
				const fullPath = `server_uploads/company_logos/${generateUniqueFilename(logo.originalname)}`;
				await s3.send(
					new PutObjectCommand({
						Bucket: process.env.AWS_BUCKET_NAME,
						Key: fullPath,
						Body: fs.createReadStream(logo.path),
						ContentType: logo.mimetype,
					}),
				);
				updateData.logo = fullPath;
			}

			const result = await userRepo.update(id, updateData);

			await publishEvent('user.profile_updated', {
				eventId: crypto.randomUUID(),
				eventType: 'user.profile_updated',
				version: '1.0',
				timestamp: new Date().toISOString(),
				source: 'SCM',
				data: {
					auth_user_id: userData.swayamm_user_id,
					uuid: userData.uuid,
					name: updateData.name,
					password: updateData.password,
					roles: roles ?? [],
					...(updateData.image !== undefined && { image: updateData.image }),
					...(updateData.logo !== undefined && { logo: updateData.logo }),
				},
			});

			const user = await userRepo.userById(id);
			const userObj = user.get({ plain: true });
			let imageUrl = null;
			if (userObj.image) {
				userObj.imageUrl = await generateSignedUrl(user.image);
			}

			return userObj;
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async getUserProfileById(id) {
		try {
			const user = await userRepo.getUserProfileById(id);

			if (!user) return null;

			// const userJson = user.toJSON();

			return user;
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async getTechSupportUsers(company_id, project_id) {
		try {
			const users = await userRepo.getTechSupportUsers(company_id, project_id);

			return users;
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async sendForgotPasswordMail(email) {
		try {
			const user = await userRepo.checkUserByEmail(email);

			const users = await userRepo.sendForgotPasswordMail(user, email);

			return users;
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async resetPassword(token, newPassword) {
		const { user, hashedPassword } = await userRepo.resetPassword(token, newPassword);

		await publishEvent(
			'user.password_changed',
			buildPasswordChangedEvent(user.uuid, hashedPassword),
		);
	}

	async _resolveAppRoles(appAccess) {
		const resolved = [];

		for (const { app_code, role_code } of appAccess) {
			// Validate app exists
			const app = await userRepo.findAppByCode(app_code);
			if (!app) throw new AppError(`App not found: ${app_code}`, 400);
			if (!app.active) throw new AppError(`App is inactive: ${app_code}`, 400);

			// Validate role exists for this app
			const role = await Role.findOne({
				where: { code: role_code, app_code },
			});
			if (!role) {
				throw new AppError(
					`Role '${role_code}' not found for app '${app_code}'`,
					400,
				);
			}

			resolved.push({ app, role });
		}

		return resolved;
	}
}

function generateUniqueFilename(originalName) {
	const extension = path.extname(originalName);
	return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
}

module.exports = UserService;
