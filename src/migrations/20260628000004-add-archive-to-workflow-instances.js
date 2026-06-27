'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('workflow_instances', 'is_archived', {
			type: Sequelize.BOOLEAN,
			allowNull: false,
			defaultValue: false,
		});
		await queryInterface.addColumn('workflow_instances', 'archived_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
		await queryInterface.addColumn('workflow_instances', 'archived_by', {
			type: Sequelize.JSON,
			allowNull: true,
		});
	},
	async down(queryInterface) {
		await queryInterface.removeColumn('workflow_instances', 'is_archived');
		await queryInterface.removeColumn('workflow_instances', 'archived_at');
		await queryInterface.removeColumn('workflow_instances', 'archived_by');
	},
};
