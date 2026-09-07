'use strict';

/**
 * Purchase Invoice items are bound from the MRN (PO) or QC/WO item (WO) — for
 * a batch- or serial-tracked product, that's also the only place the actual
 * received batch/serial numbers live (the PO/WO item's own record only knows
 * what was originally ordered against, not necessarily what specific
 * batch/serial the vendor actually shipped). Persisting a resolved snapshot
 * here, same pattern as productSnapshot/uomSnapshot, so a saved invoice
 * line can display what it was actually billed against without needing a
 * live re-lookup (and without the ambiguity a live lookup would hit once
 * more MRNs/QC rounds exist against the same PO/WO item later).
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('purchase_invoice_items', 'stock_type', {
			type: Sequelize.ENUM('normal', 'batch', 'serial'),
			allowNull: true,
		});
		await queryInterface.addColumn('purchase_invoice_items', 'batchSnapshot', {
			type: Sequelize.JSON,
			allowNull: true,
		});
		await queryInterface.addColumn('purchase_invoice_items', 'serial_nos', {
			type: Sequelize.JSON,
			allowNull: true,
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('purchase_invoice_items', 'stock_type');
		await queryInterface.removeColumn('purchase_invoice_items', 'batchSnapshot');
		await queryInterface.removeColumn('purchase_invoice_items', 'serial_nos');
	},
};
