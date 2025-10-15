'use strict';
const bcrypt = require('bcrypt');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		const password = await bcrypt.hash('1234', 10);
		await queryInterface.bulkInsert('Users', [{
			name: 'Super Admin',
			email: 'superadmin@indomind.ai',
			password: password,
			roleId: 1,
			is_active: 1,
			createdAt: new Date(),
			updatedAt: new Date(),
		}], {});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.bulkDelete('Users', {
			email: 'superadmin@indomind.ai' // safer rollback
		}, {});
	},
};
