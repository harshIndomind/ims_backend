'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		const existingRoles = await queryInterface.sequelize.query(
			`SELECT code FROM Roles WHERE code = 'purchase_invoice_approver'`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (existingRoles.length) return;

		await queryInterface.bulkInsert('Roles', [
			{
				name: 'Purchase Invoice Approver',
				code: 'purchase_invoice_approver',
				description: 'Final approval stage for Purchase Invoices.',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
	},

	async down(queryInterface) {
		await queryInterface.bulkDelete('Roles', { code: 'purchase_invoice_approver' }, {});
	},
};
