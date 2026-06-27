'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface) {
		await queryInterface.bulkInsert('Roles', [
			{
				name: 'Indent Approver',
				code: 'indent_approver',
				description: 'Final approval stage for Indents, after verification.',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
	},
	async down(queryInterface) {
		await queryInterface.bulkDelete('Roles', { code: 'indent_approver' }, {});
	},
};
