'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.removeColumn('indent_item_qty_log', 'vendor_name');
		await queryInterface.removeColumn('indent_item_qty_log', 'vendor_code');
		await queryInterface.addColumn('indent_item_qty_log', 'vendor_snapshot', {
			type: Sequelize.JSON,
			allowNull: true,
			comment: 'Snapshot of VCP vendor fields (name, code, gstin, ...) at reissue time — vendor_id is a cross-service id with no local table to join for display. A single JSON column instead of one column per field, so more fields can be captured later without another migration.',
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('indent_item_qty_log', 'vendor_snapshot');
		await queryInterface.addColumn('indent_item_qty_log', 'vendor_name', {
			type: Sequelize.STRING(200),
			allowNull: true,
		});
		await queryInterface.addColumn('indent_item_qty_log', 'vendor_code', {
			type: Sequelize.STRING(50),
			allowNull: true,
		});
	},
};
