'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('IndentItems', 'base_qty_issued', {
			type: Sequelize.DOUBLE,
			allowNull: true,
			defaultValue: 0,
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('IndentItems', 'base_qty_issued');
	},
};
