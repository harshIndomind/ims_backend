'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('BankDetails', 'account_holder_name', {
			type: Sequelize.STRING,
			allowNull: true
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('BankDetails', 'account_holder_name');
	},
};
