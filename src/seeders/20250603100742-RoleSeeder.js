'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.bulkInsert('Roles', [
			{
				name: 'Super Admin',
				code: 'super_admin',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'Org Admin',
				code: 'org_admin',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'App Admin',
				code: 'app_admin',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
						{
				name: 'App User',
				code: 'app_user',
				description: 'Basic dashboard details view.',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'Budget Entry',
				code: 'budget_entry',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'Budget Approver',
				code: 'budget_approver',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'Indent Verifier',
				code: 'indent_verifier',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'App User',
				code: 'app_user',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'PR Creator',
				code: 'payment_requisition_creator',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				name: 'PR Approver',
				code: 'payment_requisition_approver',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.bulkDelete('Roles', null, {});
	},
};
