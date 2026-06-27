'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('Indents', 'status', {
			type: Sequelize.ENUM('draft', 'in_progress', 'approved', 'rejected', 'cancelled'),
			allowNull: false,
			defaultValue: 'draft',
		});
		await queryInterface.addColumn('Indents', 'approved_by', {
			type: Sequelize.JSON,
			allowNull: true,
		});
		await queryInterface.addColumn('Indents', 'approved_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
		await queryInterface.addColumn('Indents', 'rejected_by', {
			type: Sequelize.JSON,
			allowNull: true,
		});
		await queryInterface.addColumn('Indents', 'rejected_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
		await queryInterface.addColumn('Indents', 'rejection_remarks', {
			type: Sequelize.TEXT,
			allowNull: true,
		});
		await queryInterface.addColumn('Indents', 'cancelled_by', {
			type: Sequelize.JSON,
			allowNull: true,
		});
		await queryInterface.addColumn('Indents', 'cancelled_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
		await queryInterface.addColumn('Indents', 'cancellation_remarks', {
			type: Sequelize.TEXT,
			allowNull: true,
		});
	},
	async down(queryInterface) {
		await queryInterface.removeColumn('Indents', 'status');
		await queryInterface.removeColumn('Indents', 'approved_by');
		await queryInterface.removeColumn('Indents', 'approved_at');
		await queryInterface.removeColumn('Indents', 'rejected_by');
		await queryInterface.removeColumn('Indents', 'rejected_at');
		await queryInterface.removeColumn('Indents', 'rejection_remarks');
		await queryInterface.removeColumn('Indents', 'cancelled_by');
		await queryInterface.removeColumn('Indents', 'cancelled_at');
		await queryInterface.removeColumn('Indents', 'cancellation_remarks');
	},
};
