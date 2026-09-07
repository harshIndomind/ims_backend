'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('purchase_invoice_charges', 'tax_treatment', {
			// Nullable — old rows (created before Other Charges switched to the shared
			// charge-tax engine's UI/model) never had this concept: they were either taxed
			// via a picked `tax_id` (now equivalent to SPECIFIC_RATE, but with the rate
			// carried by tax_rate below instead of a tax_id/taxSnapshot lookup) or not
			// taxed at all. New rows always set this explicitly.
			type: Sequelize.ENUM('NON_TAXABLE', 'SPECIFIC_RATE', 'INHERIT_ITEM_TAX'),
			allowNull: true,
		});
		await queryInterface.addColumn('purchase_invoice_charges', 'tax_rate', {
			// The raw GST rate (e.g. 18.00) for a SPECIFIC_RATE charge, entered directly in
			// the shared <ChargesTable> UI — replaces charge_type_id/tax_id/taxSnapshot's
			// master-lookup role for charges created via that component. Those older
			// columns are left in place (nullable, unused going forward) rather than
			// dropped, since removing them would be a bigger, riskier schema change than
			// this feature needs.
			type: Sequelize.DECIMAL(5, 2),
			allowNull: true,
		});
	},
	async down(queryInterface) {
		await queryInterface.removeColumn('purchase_invoice_charges', 'tax_rate');
		await queryInterface.removeColumn('purchase_invoice_charges', 'tax_treatment');
	},
};
