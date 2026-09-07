'use strict';

/**
 * purchase_invoice_items never got a uomSnapshot column at all — the invoice
 * item's productSnapshot (copied from the PO/WO item) never actually carries
 * UOM data in this codebase's data model (confirmed: PurchaseOrderItem's own
 * productSnapshot has no baseUnit field; the real unit lives on uomSnapshot,
 * e.g. uomSnapshot.unit.name = "Cartons"). Without this column, a saved
 * invoice line has no way to display what unit it was actually billed in.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('purchase_invoice_items', 'uomSnapshot', {
			type: Sequelize.JSON,
			allowNull: true,
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('purchase_invoice_items', 'uomSnapshot');
	},
};
