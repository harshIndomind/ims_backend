'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		const existingRoles = await queryInterface.sequelize.query(
			`SELECT code FROM Roles WHERE code IN ('qc_inspector', 'qc_approver')`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		const existingCodes = new Set(existingRoles.map((r) => r.code));

		const rolesToInsert = [];
		if (!existingCodes.has('qc_inspector')) {
			rolesToInsert.push({
				name: 'QC Inspector',
				code: 'qc_inspector',
				description: 'Performs quality inspection against acknowledged goods and records the checklist/quantities.',
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}
		if (!existingCodes.has('qc_approver')) {
			rolesToInsert.push({
				name: 'QC Approver',
				code: 'qc_approver',
				description: 'Final sign-off stage for a completed QC inspection.',
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}
		if (rolesToInsert.length) {
			await queryInterface.bulkInsert('Roles', rolesToInsert);
		}
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.bulkDelete('Roles', { code: ['qc_inspector', 'qc_approver'] }, {});
	},
};
