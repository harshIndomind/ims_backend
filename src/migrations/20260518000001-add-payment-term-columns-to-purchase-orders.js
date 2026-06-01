'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('PurchaseOrders', 'payment_term_value', {
			type: Sequelize.DECIMAL(5, 2),
			allowNull: true,
			defaultValue: null,
			comment: 'Percentage value between 0 and 100',
		});
		await queryInterface.addColumn('PurchaseOrders', 'payment_term_amount', {
			type: Sequelize.DECIMAL(15, 2),
			allowNull: true,
			defaultValue: null,
			comment: 'Calculated amount = grandTotal * (payment_term_value / 100)',
		});
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('PurchaseOrders', 'payment_term_value');
		await queryInterface.removeColumn('PurchaseOrders', 'payment_term_amount');
	},
};
