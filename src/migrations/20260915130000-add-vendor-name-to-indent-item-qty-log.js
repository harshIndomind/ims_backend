'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('indent_item_qty_log', 'vendor_name', {
			type: Sequelize.STRING(200),
			allowNull: true,
			comment: 'Snapshot of the VCP vendor name at reissue time — vendor_id is a cross-service id with no local table to join for display, same pattern as WorkOrder/PurchaseOrder.vendorInfo snapshots.',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('indent_item_qty_log', 'vendor_name');
	},
};
