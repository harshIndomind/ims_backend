'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.changeColumn('WorkOrders', 'status', {
			type: Sequelize.ENUM('draft', 'in_progress', 'approved', 'rejected', 'cancelled', 'pending', 'completed'),
			allowNull: false,
			defaultValue: 'draft',
		});
		await queryInterface.addColumn('WorkOrders', 'approved_by', {
			type: Sequelize.JSON,
			allowNull: true,
		});
		await queryInterface.addColumn('WorkOrders', 'approved_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
		await queryInterface.addColumn('WorkOrders', 'rejected_by', {
			type: Sequelize.JSON,
			allowNull: true,
		});
		await queryInterface.addColumn('WorkOrders', 'rejected_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
		await queryInterface.addColumn('WorkOrders', 'rejection_remarks', {
			type: Sequelize.TEXT,
			allowNull: true,
		});
		await queryInterface.addColumn('WorkOrders', 'cancelled_by', {
			type: Sequelize.JSON,
			allowNull: true,
		});
		await queryInterface.addColumn('WorkOrders', 'cancelled_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
		await queryInterface.addColumn('WorkOrders', 'cancellation_remarks', {
			type: Sequelize.TEXT,
			allowNull: true,
		});
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.changeColumn('WorkOrders', 'status', {
			type: Sequelize.ENUM('pending', 'completed'),
			allowNull: false,
			defaultValue: 'pending',
		});
		await queryInterface.removeColumn('WorkOrders', 'approved_by');
		await queryInterface.removeColumn('WorkOrders', 'approved_at');
		await queryInterface.removeColumn('WorkOrders', 'rejected_by');
		await queryInterface.removeColumn('WorkOrders', 'rejected_at');
		await queryInterface.removeColumn('WorkOrders', 'rejection_remarks');
		await queryInterface.removeColumn('WorkOrders', 'cancelled_by');
		await queryInterface.removeColumn('WorkOrders', 'cancelled_at');
		await queryInterface.removeColumn('WorkOrders', 'cancellation_remarks');
	},
};
