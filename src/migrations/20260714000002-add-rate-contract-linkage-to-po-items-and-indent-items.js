'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		// PurchaseOrderItems: record which RC line was used and snapshot the commercial terms
		// at PO creation time so historical POs are never affected by RC edits/expiry.
		await queryInterface.addColumn('PurchaseOrderItems', 'rate_contract_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});
		await queryInterface.addColumn('PurchaseOrderItems', 'rate_contract_product_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});
		await queryInterface.addColumn('PurchaseOrderItems', 'rc_snapshot', {
			type: Sequelize.JSON,
			allowNull: true,
		});

		// IndentItems: optional reference — lets approvers see which RC covers this item
		await queryInterface.addColumn('IndentItems', 'rate_contract_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('PurchaseOrderItems', 'rate_contract_id');
		await queryInterface.removeColumn('PurchaseOrderItems', 'rate_contract_product_id');
		await queryInterface.removeColumn('PurchaseOrderItems', 'rc_snapshot');
		await queryInterface.removeColumn('IndentItems', 'rate_contract_id');
	},
};
