'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		const existingRoles = await queryInterface.sequelize.query(
			`SELECT code FROM Roles WHERE code = 'short_close_approver'`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (existingRoles.length) return;

		await queryInterface.bulkInsert('Roles', [
			{
				name: 'Short Close Approver',
				code: 'short_close_approver',
				description: 'Final approval stage for PO/WO Short Close Requests.',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
	},

	async down(queryInterface) {
		await queryInterface.bulkDelete('Roles', { code: 'short_close_approver' }, {});
	},
};
