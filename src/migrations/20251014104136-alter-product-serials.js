'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.changeColumn('ProductSerials', 'serial_no', {
			type: Sequelize.STRING(100),
			allowNull: false,
		});

    await queryInterface.addColumn('ProductSerials', 'is_sell', {
			type: Sequelize.BOOLEAN,
			defaultValue: false,
		});

		// Optional: Add unique index on serial_no
		await queryInterface.addIndex('ProductSerials', ['serial_no'], {
			unique: true,
			name: 'productserials_serial_no_unique',
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.changeColumn('ProductSerials', 'serial_no', {
			type: Sequelize.STRING,
			allowNull: false,
		});

    await queryInterface.removeColumn('ProductSerials', 'is_sell');

		// Remove unique index
		await queryInterface.removeIndex(
			'ProductSerials',
			'productserials_serial_no_unique'
		);
	},
};
