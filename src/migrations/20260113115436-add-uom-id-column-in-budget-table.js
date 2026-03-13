'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('Budgets', 'uom_id', {
			type: Sequelize.INTEGER,
			allowNull: true
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('Budgets', 'uom_id');
	},
};
