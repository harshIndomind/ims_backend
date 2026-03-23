'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.bulkInsert('Roles', [
			{ name: 'Super Admin', createdAt: new Date(), updatedAt: new Date() },
			{ name: 'Admin', createdAt: new Date(), updatedAt: new Date() },
			{ name: 'Org Admin', createdAt: new Date(), updatedAt: new Date() },
			{
				name: 'Budget Entry',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'Budget Approver',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'Budget Lock/Unlock',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.bulkDelete('Roles', null, {});
	},
};
