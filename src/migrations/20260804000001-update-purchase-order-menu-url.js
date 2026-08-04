'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.sequelize.query(
			`UPDATE Menus SET url = '/transaction/purchase-order' WHERE slug = 'purchase-order'`,
		);
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.sequelize.query(
			`UPDATE Menus SET url = '/purchase-order' WHERE slug = 'purchase-order'`,
		);
	},
};
