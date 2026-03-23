'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('MasterPeriods', 'from_date', {
			type: Sequelize.DATEONLY,
			allowNull: true,
		});
		await queryInterface.addColumn('MasterPeriods', 'end_date', {
			type: Sequelize.DATEONLY,
			allowNull: true,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('MasterPeriods', 'from_date');
		await queryInterface.removeColumn('MasterPeriods', 'end_date');
	},
};
