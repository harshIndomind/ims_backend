'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('Invoices', 'paymentStatus', {
			type: Sequelize.STRING,
			allowNull: true,
			defaultValue: 'PENDING',
		});
		await queryInterface.addColumn('Invoices', 'totalPaid', {
			type: Sequelize.DECIMAL(15, 2),
			defaultValue: 0,
			allowNull: true,
		});
		await queryInterface.addColumn('Invoices', 'remainingAmount', {
			type: Sequelize.DECIMAL(15, 2),
			defaultValue: 0,
			allowNull: true,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('Invoices', 'paymentStatus');
		await queryInterface.removeColumn('Invoices', 'totalPaid');
		await queryInterface.removeColumn('Invoices', 'remainingAmount');
	},
};
