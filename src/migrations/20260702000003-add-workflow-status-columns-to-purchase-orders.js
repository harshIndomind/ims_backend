'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.changeColumn('PurchaseOrders', 'status', {
			type: Sequelize.ENUM('draft', 'in_progress', 'approved', 'rejected', 'cancelled', 'pending', 'completed'),
			allowNull: false,
			defaultValue: 'draft',
		});
		await queryInterface.addColumn('PurchaseOrders', 'approved_by', {
			type: Sequelize.JSON,
			allowNull: true,
		});
		await queryInterface.addColumn('PurchaseOrders', 'approved_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
		await queryInterface.addColumn('PurchaseOrders', 'rejected_by', {
			type: Sequelize.JSON,
			allowNull: true,
		});
		await queryInterface.addColumn('PurchaseOrders', 'rejected_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
		await queryInterface.addColumn('PurchaseOrders', 'rejection_remarks', {
			type: Sequelize.TEXT,
			allowNull: true,
		});
		await queryInterface.addColumn('PurchaseOrders', 'cancelled_by', {
			type: Sequelize.JSON,
			allowNull: true,
		});
		await queryInterface.addColumn('PurchaseOrders', 'cancelled_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
		await queryInterface.addColumn('PurchaseOrders', 'cancellation_remarks', {
			type: Sequelize.TEXT,
			allowNull: true,
		});
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.changeColumn('PurchaseOrders', 'status', {
			type: Sequelize.ENUM('pending', 'completed'),
			allowNull: false,
			defaultValue: 'pending',
		});
		await queryInterface.removeColumn('PurchaseOrders', 'approved_by');
		await queryInterface.removeColumn('PurchaseOrders', 'approved_at');
		await queryInterface.removeColumn('PurchaseOrders', 'rejected_by');
		await queryInterface.removeColumn('PurchaseOrders', 'rejected_at');
		await queryInterface.removeColumn('PurchaseOrders', 'rejection_remarks');
		await queryInterface.removeColumn('PurchaseOrders', 'cancelled_by');
		await queryInterface.removeColumn('PurchaseOrders', 'cancelled_at');
		await queryInterface.removeColumn('PurchaseOrders', 'cancellation_remarks');
	},
};
