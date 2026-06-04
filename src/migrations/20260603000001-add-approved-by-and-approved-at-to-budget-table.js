'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('Budgets', 'approved_by', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});

		await queryInterface.addColumn('Budgets', 'approved_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('Budgets', 'approved_at');
		await queryInterface.removeColumn('Budgets', 'approved_by');
	},
};
