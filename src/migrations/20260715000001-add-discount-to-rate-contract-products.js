'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('RateContractProducts', 'discount', {
			type: Sequelize.DOUBLE,
			allowNull: false,
			defaultValue: 0,
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('RateContractProducts', 'discount');
	},
};
