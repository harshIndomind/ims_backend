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
} = require('../models/index');
const AppError = require('../utils/AppError');
const { sendForgotPasswordMail } = require('../utils/mailer');
const crypto = require('crypto');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const { generateSignedUrl } = require('../utils/s3Bucket');
class UserRepository {
	// constructor(userModel) {
	// 	this.userModel = userModel;
	// }

	async create(data) {
		try {
			console.log('existingUser ', data);
			const existingUser = await User.findOne({ where: { email: data.email } });
			if (existingUser) {
				throw new AppError(
					'A user already exists with this e-mail address',
					400
				);
			}
			const user = await User.create(data);

			return user;
		} catch (error) {
			console.error('Something went wrong in the repository layer');
			throw error;
		}
	}

	async update(id, data) {
		try {
			await User.update(data, {where: {swayamm_user_id: id}});
			return User.findOne({
				where: { swayamm_user_id: id },
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

	async allUsers(org_id, role) {
		try {

			if(role === 'Super Admin') {
				var whereClause = {};
			} else {
				var whereClause = { roleId: { [Op.notIn]: [1, 2] }, org_id };
			}
			console.log("allUsers whereClause => ", whereClause);
			
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
				attributes: [
					'id',
					'name',
					'email',
					'image',
					'logo',
					// ['image', 'imageUrl'],
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
						// attributes: ['org_name', 'org_code'],
					},
					// {
					// 	model: BusinessPartner,
					// 	as: 'partner',
					// 	// attributes: ['org_name', 'org_code'],
					// 	include: {
					// 		model: Address,
					// 		as: 'addresses',
					// 		include: {
					// 			model: GstStateCode,
					// 			as: 'stateData',
					// 		},
					// 	},
					// },
				],
			});

			const userData = user.get({ plain: true });

			let response = {};
			if (userData.image) {
				userData.imageUrl = await generateSignedUrl(user.image);
			}
			if (userData.logo) {
				userData.logoUrl = await generateSignedUrl(user.logo);
			}
			if (userData) {
				response = { ...userData };
				if (
					userData.Role.name &&
					['Admin', 'Super Admin'].includes(userData.Role.name)
				) {
					response['vendor_company_name'] =
						userData?.organization?.org_name ?? '';
					response['vendor_company_code'] =
						userData?.organization?.org_code ?? '';
					response['vendor_contact_no'] =
						userData?.organization?.org_person_contact ?? '';
					response['vendor_address'] =
						userData?.organization?.org_address ?? '';
				} else if (
					userData.Role.name &&
					['Vendor', 'Vendor-Customer'].includes(userData.Role.name) &&
					userData?.partner
				) {
					const billing = userData?.partner?.addresses[0];

					const addressParts = [
						billing.address1,
						billing.address2,
						billing?.city,
						billing?.pincode,
						billing?.stateData?.state_name,
						billing?.countryData?.name,
					];

					const address = addressParts.filter(Boolean).join(', ');

					response['vendor_company_name'] = userData?.partner?.name ?? '';
					response['vendor_company_code'] = userData?.partner?.code ?? '';
					response['vendor_contact_no'] = userData?.partner?.contact_no ?? '';
					response['vendor_address'] = address ?? '';
				}
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

	async getTechSupportUsers(companyId, projectId) {
		try {
			const users = await User.findAll({
				where: { companyId, roleId: 4 },
				include: [
					{
						model: UserProject,
						as: 'UserProjects',
						where: { projectId },
					},
				],
			});

			return users;
		} catch (error) {
			console.error('Something went wrong in the repository layer');
			throw error;
		}
	}

	async checkUserByEmail(email) {
		try {
			const isUserExists = await User.findOne({
				where: { email },
			});

			if (isUserExists === null) {
				throw new AppError(
					'No user found with the provided email address.',
					400
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
					400
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

			return true;
		} catch (error) {
			console.error('Something went wrong in the repository layer');
			throw error;
		}
	}

	async getOrganizationIdBySwayammOrgId(swayamm_org_id){
		const orgData = await organization.findOne({where: {swayamm_org_id}});

		if(!orgData){
			throw new AppError("Organization not found with swayamm org id");
		}

		return orgData.id;
	}
}

module.exports = UserRepository;
