'use strict';

/**
 * Records which MRN/QC (if any) the invoice was originally looked up/scoped
 * from, alongside the always-required purchase_order_id/work_order_id — the
 * item table itself doesn't retain this (a PO item can span several MRNs),
 * so without this the header has no way to answer "which delivery/inspection
 * does this bill correspond to" once saved. Both nullable: a PO invoice may
 * be created straight off the P.O. number with no MRN/QC picked, and a WO
 * invoice has no MRN-equivalent at all.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('purchase_invoices', 'mrn_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: {
				model: 'GoodsReceiptNotes',
				key: 'id',
			},
		});
		await queryInterface.addColumn('purchase_invoices', 'qc_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: {
				model: 'qc_inspections',
				key: 'id',
			},
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('purchase_invoices', 'mrn_id');
		await queryInterface.removeColumn('purchase_invoices', 'qc_id');
	},
};
