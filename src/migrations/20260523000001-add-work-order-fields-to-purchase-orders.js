'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('PurchaseOrders', 'start_date', {
			type: Sequelize.DATEONLY,
			allowNull: true,
		});
		await queryInterface.addColumn('PurchaseOrders', 'end_date', {
			type: Sequelize.DATEONLY,
			allowNull: true,
		});
		await queryInterface.addColumn('PurchaseOrders', 'retention', {
			type: Sequelize.DECIMAL(5, 2),
			allowNull: true,
		});
		await queryInterface.addColumn('PurchaseOrders', 'retention_amount', {
			type: Sequelize.DECIMAL(15, 2),
			allowNull: true,
		});
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('PurchaseOrders', 'start_date');
		await queryInterface.removeColumn('PurchaseOrders', 'end_date');
		await queryInterface.removeColumn('PurchaseOrders', 'retention');
		await queryInterface.removeColumn('PurchaseOrders', 'retention_amount');
	},
};
