'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.sequelize.query(
			`UPDATE Menus SET showInSidebar = 0 WHERE slug IN ('sub-head', 'sub-head-amount')`,
		);
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.sequelize.query(
			`UPDATE Menus SET showInSidebar = 1 WHERE slug IN ('sub-head', 'sub-head-amount')`,
		);
	},
};
