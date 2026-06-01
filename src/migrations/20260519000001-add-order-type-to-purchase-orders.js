'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('PurchaseOrders', 'orderType', {
			type: Sequelize.ENUM('purchase_order', 'work_order'),
			allowNull: false,
			defaultValue: 'purchase_order',
		});
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('PurchaseOrders', 'orderType');
	},
};
