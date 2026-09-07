'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('purchase_invoice_charges', 'value_type', {
			type: Sequelize.ENUM('rupee', 'percentage'),
			allowNull: false,
			defaultValue: 'rupee',
		});
		await queryInterface.addColumn('purchase_invoice_charges', 'operation_type', {
			type: Sequelize.ENUM('+', '-'),
			allowNull: false,
			defaultValue: '+',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('purchase_invoice_charges', 'value_type');
		await queryInterface.removeColumn('purchase_invoice_charges', 'operation_type');
	},
};
