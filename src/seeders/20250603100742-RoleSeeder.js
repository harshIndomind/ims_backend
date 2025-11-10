'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.bulkInsert('Roles', [
			{ name: 'Super Admin', createdAt: new Date(), updatedAt: new Date() },
			{ name: 'Admin', createdAt: new Date(), updatedAt: new Date() },
			{
				name: 'Vendor',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'Vendor-Customer',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.bulkDelete('Roles', null, {});
	},
};
