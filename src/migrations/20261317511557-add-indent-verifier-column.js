'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('Indents', 'isVerified', {
			type: Sequelize.BOOLEAN,
			defaultValue: false,
		});

    await queryInterface.addColumn('Indents', 'verifiedBy', {
			type: Sequelize.JSON,
			allowNull: true,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('Indents', 'isVerified');
		await queryInterface.removeColumn('Indents', 'verifiedBy');
	},
};
