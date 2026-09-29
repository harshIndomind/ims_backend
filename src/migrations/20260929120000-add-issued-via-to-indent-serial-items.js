'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('IndentSerialItems', 'issued_via', {
			type: Sequelize.STRING(20),
			allowNull: true,
			comment: "How the serial was issued: 'approval' or 'reissue'. NULL for rows issued before this column existed.",
		});
		await queryInterface.addColumn('IndentSerialItems', 'issued_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('IndentSerialItems', 'issued_at');
		await queryInterface.removeColumn('IndentSerialItems', 'issued_via');
	},
};
