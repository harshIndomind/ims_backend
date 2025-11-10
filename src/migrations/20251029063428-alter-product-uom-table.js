'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.changeColumn('ProductUOMs', 'qty', {
			type: Sequelize.DECIMAL(12, 5),
			allowNull: true,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.changeColumn('ProductUOMs', 'qty', {
			type: Sequelize.DECIMAL(12, 2),
			allowNull: true,
		});
	},
};
