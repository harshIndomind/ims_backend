'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.bulkInsert('Taxes', [
			{
				name: 'GST 0.1%',
				rate: '0.1',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'GST 0.25%',
				rate: '0.25',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'GST 0.5%',
				rate: '0.5',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'GST 1%',
				rate: '1',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'GST 1.5%',
				rate: '1.5',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'GST 3%',
				rate: '3',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'GST 5%',
				rate: '5',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'GST 6%',
				rate: '6',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'GST 7.5%',
				rate: '7.5',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'GST 12%',
				rate: '12',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'GST 18%',
				rate: '18',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'GST 28%',
				rate: '28',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'GST 40%',
				rate: '40',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'Nil Rated',
				rate: 'Nil Rated',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'Exempt',
				rate: 'Exempt',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'Non-GST',
				rate: 'Non-GST',
				is_active: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.bulkDelete('Taxes', null, {});
	},
};
