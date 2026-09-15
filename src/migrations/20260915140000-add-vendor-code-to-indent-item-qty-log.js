'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('indent_item_qty_log', 'vendor_code', {
			type: Sequelize.STRING(50),
			allowNull: true,
			comment: 'Snapshot of the VCP vendor code at reissue time — same cross-service snapshot rationale as vendor_name.',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('indent_item_qty_log', 'vendor_code');
	},
};
