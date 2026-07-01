'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('IndentItems', 'qty_in_stock', {
			type: Sequelize.DOUBLE,
			allowNull: true,
			defaultValue: 0,
		});
		await queryInterface.addColumn('IndentItems', 'balance_indent_qty', {
			type: Sequelize.DOUBLE,
			allowNull: true,
			defaultValue: 0,
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('IndentItems', 'qty_in_stock');
		await queryInterface.removeColumn('IndentItems', 'balance_indent_qty');
	},
};
