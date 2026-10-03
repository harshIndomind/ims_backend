'use strict';

/**
 * Per-charge flag: does this PO/WO charge count against the budget commitment limit?
 * Defaults to true so every existing charge keeps counting (the conservative reading of the
 * "PO/WO incl. charges must not exceed budget" rule) — see budget-validation.service.js.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('document_charges', 'budget_impact', {
			type: Sequelize.BOOLEAN,
			allowNull: false,
			defaultValue: true,
			after: 'tax_rate',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('document_charges', 'budget_impact');
	},
};
