const { UserRepository } = require('../repository/index');

class UserService {
	constructor() {
		this.userRepo = new UserRepository();
	}

	async create(data) {
		try {
			const user = await this.userRepo.create(data);

			return user;
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async update(id, data) {
		try {
			const user = await this.userRepo.update(id, data);

			return user;
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async destroy(id) {
		try {
			const user = await this.userRepo.delete(id);

			return user;
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async getAllUsers(org_id) {
		try {
			const users = await this.userRepo.allUsers(org_id);

			return users;
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async getUserById(id) {
		try {
			const user = await this.userRepo.userById(id);
			console.log({ user });

			if (!user) return null;

			const userJson = user.toJSON();

			return {
				...userJson,
				projectId: userJson.projects?.map((p) => String(p.id)) || [],
			};
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async getUserProfileById(id) {
		try {
			const user = await this.userRepo.getUserProfileById(id);

			if (!user) return null;

			// const userJson = user.toJSON();

			return user
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async getTechSupportUsers(company_id, project_id) {
		try {
			const users = await this.userRepo.getTechSupportUsers(company_id, project_id);

			return users
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async sendForgotPasswordMail(email) {
		try {
			const user = await this.userRepo.checkUserByEmail(email);

			const users = await this.userRepo.sendForgotPasswordMail(user, email);

			return users
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}

	async resetPassword(token, newPassword) {
		try {

			const resetPass = await this.userRepo.resetPassword(token, newPassword);

			return resetPass
		} catch (error) {
			console.error('Something went wrong in the service layer');
			throw error;
		}
	}
}

module.exports = UserService;
