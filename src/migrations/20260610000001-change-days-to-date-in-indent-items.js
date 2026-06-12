'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.changeColumn('IndentItems', 'days', {
			type: Sequelize.DATEONLY,
			allowNull: true,
			defaultValue: null,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.changeColumn('IndentItems', 'days', {
			type: Sequelize.INTEGER,
			defaultValue: 0,
		});
	},
};
