'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('audit_logs', 'workflow_stage_name', {
			type: Sequelize.STRING(150),
			allowNull: true,
		});
	},
	async down(queryInterface) {
		await queryInterface.removeColumn('audit_logs', 'workflow_stage_name');
	},
};
