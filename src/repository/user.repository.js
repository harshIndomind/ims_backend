const { CLIENT_BASE_URL } = require('../config/serverConfig');
const {
	User,
	organization,
	Role,
	Company,
	UserProject,
	ResetPassword,
	Alert,
	AlertReads,
	BusinessPartner,
	Address,
	GstStateCode,
	UserRole,
} = require('../models/index');
const AppError = require('../utils/AppError');
const { sendForgotPasswordMail } = require('../utils/mailer');
const crypto = require('crypto');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const { generateSignedUrl } = require('../utils/s3Bucket');
const logger = require('../utils/logger');
class UserRepository {
	async findByEmail(email) {
		return User.findOne({ where: { email } });
	}

	async findById(id) {
		return User.findOne({
			where: { id },
			include: [
				{
					model: Role,
					as: 'userRoles',
					through: { attributes: [] },
					attributes: ['name', 'code'],
				},
				{
					model: organization,
					as: 'organization',
					required: false,
				},
			],
			attributes: { exclude: ['password'] },
		});
	}
	async findRoleByCode(code) {
		return Role.findOne({
			where: { code },
		});
	}

	async create(data, options = {}) {
		try {
			console.log('existingUser ', data);
			const existingUser = await User.findOne({ where: { email: data.email } });
			if (existingUser) {
				throw new AppError(
					'A user already exists with this e-mail address',
					400,
				);
			}
			const user = await User.create(data, options);

			return user;
		} catch (error) {
			console.error('Something went wrong in the repository layer');
			throw error;
		}
	}

	async update(id, data) {
		try {
			await User.update(data, { where: { id } });
			return User.findOne({
				where: { id },
				include: {
					model: Role,
					attributes: ['name'],
				},
				attributes: ['id', 'name', 'email', ['image', 'imageUrl'], 'roleId'],
			});
		} catch (error) {
			console.error('Something went wrong in the repository layer');
			throw error;
		}
	}

	async createUserRole(data, transaction) {
		return UserRole.create(data, { transaction });
	}

	async allUsers(org_id, role) {
		try {
			if (role === 'Super Admin') {
				var whereClause = {};
			} else {
				var whereClause = { roleId: { [Op.notIn]: [1, 2] }, org_id };
			}
			console.log('allUsers whereClause => ', whereClause);

			const users = await User.findAll({
				where: whereClause,
				attributes: [
					'id',
					'name',
					'email',
					['image', 'imageUrl'],
					'roleId',
					'org_id',
					// 'vendor_company_name',
					// 'vendor_company_code',
					// 'vendor_contact_no',
					// 'vendor_address',
				],
				include: [
					{
						model: Role,
						attributes: ['name'],
					},
					{
						model: organization,
						as: 'organization',
						attributes: ['org_name', 'org_code'],
					},
				],
			});

			return users;
		} catch (error) {
			console.error('Something went wrong in the repository layer');
			throw error;
		}
	}

	async userById(id) {
		try {
			const user = await User.findOne({
				where: { id },
				attributes: {
					exclude: ['password'],
				},
			});

			return user;
		} catch (error) {
			console.error('Something went wrong in the repository layer');
			throw error;
		}
	}

	async getUserProfileById(id) {
		try {
			const user = await User.findOne({
				where: { id },
				attributes: ['id', 'name', 'email', 'image', 'logo'],
				include: [
					{
						model: Role,
						as: 'userRoles',
						through: { attributes: [] },
						attributes: ['name', 'code'],
					},
					{
						model: organization,
						as: 'organization',
					},
				],
			});

			if (!user) {
				throw new AppError('User not found', 404);
			}

			const userData = user.get({ plain: true });
			const roles = userData.userRoles?.map((r) => r.code);

			logger.debug('userData.userRoles ', { userRoles: roles });
			const response = { ...userData, roles };

			if (userData.image) {
				response.imageUrl = await generateSignedUrl(userData.image);
			}
			if (userData.logo) {
				response.logoUrl = await generateSignedUrl(userData.logo);
			}

			const isOrgRole = roles.some((r) =>
				['org_admin', 'app_admin'].includes(r),
			);

			if (isOrgRole) {
				response['vendor_company_name'] =
					userData?.organization?.org_name ?? '';
				response['vendor_company_code'] =
					userData?.organization?.org_code ?? '';
				response['vendor_contact_no'] =
					userData?.organization?.org_person_contact ?? '';
				response['vendor_address'] = userData?.organization?.org_address ?? '';
			}

			return response;
		} catch (error) {
			console.error('Something went wrong in the repository layer');
			throw error;
		}
	}

	async delete(id) {
		try {
			console.log('id in repo => ', id);
			await Alert.destroy({ where: { user_id: 3 } });
			const user = await User.destroy({ where: { id } });

			return user;
		} catch (error) {
			console.error('Something went wrong in the repository layer');
			throw error;
		}
	}

	async destroyUserRoles(userId, transaction) {
		return UserRole.destroy({
			where: { user_id: userId },
			transaction,
		});
	}

	async checkUserByEmail(email) {
		try {
			const isUserExists = await User.findOne({
				where: { email },
			});

			if (isUserExists === null) {
				throw new AppError(
					'No user found with the provided email address.',
					400,
				);
			}

			return isUserExists;
		} catch (error) {
			console.error('Something went wrong in the repository layer');
			throw error;
		}
	}

	async sendForgotPasswordMail(user, email) {
		try {
			const token = crypto.randomBytes(32).toString('hex');
			const hashedToken = crypto
				.createHash('sha256')
				.update(token)
				.digest('hex');

			const createdAt = new Date();
			let expiresAt = new Date();
			expiresAt = expiresAt.setTime(createdAt.getTime() + 5 * 60 * 1000);
			await ResetPassword.create({
				userId: user.id,
				token: hashedToken,
				expiresAt,
				createdAt,
			});
			const resetPasswordPayload = {
				subject: 'Reset Password Link 🔐',
				body: {
					name: user.name,
					passwordResetLink: `${CLIENT_BASE_URL}/reset-password/${token}`,
				},
			};

			await sendForgotPasswordMail(email, resetPasswordPayload);
		} catch (error) {
			console.error('Something went wrong in the repository layer');
			throw error;
		}
	}

	async resetPassword(token, newPassword) {
		try {
			const hashedToken = crypto
				.createHash('sha256')
				.update(token)
				.digest('hex');
			const resetRecord = await ResetPassword.findOne({
				where: {
					token: hashedToken,
					expiresAt: { [Op.gt]: new Date() },
				},
			});

			if (!resetRecord) {
				throw new AppError(
					'Your reset password link is invalid or expired. Please try again.',
					400,
				);
			}

			const user = await User.findByPk(resetRecord.userId);
			if (!user) {
				throw new AppError('User not found.');
			}

			// 3. Hash the new password
			const hashedPassword = await bcrypt.hash(newPassword, 10);

			// 4. Update the password
			user.password = hashedPassword;
			await user.save();

			await ResetPassword.destroy({ where: { userId: resetRecord.userId } });

			return { user, hashedPassword };
		} catch (error) {
			console.error('Something went wrong in the repository layer');
			throw error;
		}
	}

	async getOrganizationIdBySwayammOrgId(swayamm_org_id) {
		const orgData = await organization.findOne({ where: { swayamm_org_id } });

		if (!orgData) {
			throw new AppError('Organization not found with swayamm org id');
		}

		return orgData.id;
	}

	// New Methods
	async findAll(options = {}) {
		return await User.findAll(options);
	}

	async findAndCountAll(options = {}) {
		return await User.findAndCountAll(options);
	}
}

module.exports = new UserRepository();
