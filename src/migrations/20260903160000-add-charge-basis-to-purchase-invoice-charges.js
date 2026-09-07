'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('purchase_invoice_charges', 'charge_basis', {
			type: Sequelize.ENUM('pre_tax', 'post_tax'),
			allowNull: false,
			defaultValue: 'pre_tax',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('purchase_invoice_charges', 'charge_basis');
	},
};
