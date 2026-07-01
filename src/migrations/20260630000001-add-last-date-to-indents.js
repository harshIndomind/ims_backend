'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('Indents', 'last_date', {
			type: Sequelize.DATEONLY,
			allowNull: true,
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('Indents', 'last_date');
	},
};
