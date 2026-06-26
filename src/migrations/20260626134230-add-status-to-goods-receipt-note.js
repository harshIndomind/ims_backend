'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('GoodsReceiptNotes', 'status', {
			type: Sequelize.ENUM(['active', 'cancelled']),
			allowNull: false,
			defaultValue: 'active',
		});
		await queryInterface.addColumn('GoodsReceiptNotes', 'cancelled_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
		await queryInterface.addColumn('GoodsReceiptNotes', 'cancelled_by', {
			type: Sequelize.JSON,
			allowNull: true,
		});
	},
	async down(queryInterface) {
		await queryInterface.removeColumn('GoodsReceiptNotes', 'cancelled_by');
		await queryInterface.removeColumn('GoodsReceiptNotes', 'cancelled_at');
		await queryInterface.removeColumn('GoodsReceiptNotes', 'status');
	},
};
