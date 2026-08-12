'use strict';
/**
 * order_acknowledgement_items.arrived_qty was required whenever po_qc_check/wo_qc_check was
 * true, on the assumption that Vendor Acknowledgement is the moment physical goods quantity is
 * captured. Corrected business flow: Acknowledgement only confirms the vendor accepted the
 * PO/WO document — it carries no quantity/goods implication. Physical arrival is now captured
 * directly on the QC inspection (see qc_inspection_items.current_received_qty in the following
 * migration), so this column becomes optional/informational only.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.changeColumn('order_acknowledgement_items', 'arrived_qty', {
			type: Sequelize.DECIMAL(15, 2),
			allowNull: true,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.changeColumn('order_acknowledgement_items', 'arrived_qty', {
			type: Sequelize.DECIMAL(15, 2),
			allowNull: false,
		});
	},
};
