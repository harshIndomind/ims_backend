'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('indent_item_qty_log', 'vendor_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			comment: 'VCP business partner id (cross-service, no local FK) the reissued qty was assigned to',
		});
		await queryInterface.addColumn('indent_item_qty_log', 'work_order_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: { model: 'WorkOrders', key: 'id' },
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
		});
		await queryInterface.addIndex('indent_item_qty_log', ['work_order_id'], {
			name: 'indent_item_qty_log_work_order_idx',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeIndex('indent_item_qty_log', 'indent_item_qty_log_work_order_idx');
		await queryInterface.removeColumn('indent_item_qty_log', 'work_order_id');
		await queryInterface.removeColumn('indent_item_qty_log', 'vendor_id');
	},
};
