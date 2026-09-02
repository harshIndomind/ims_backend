'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.sequelize.query(
			`UPDATE Menus SET menuName = 'Material Receipt Note' WHERE slug = 'goods-receipt-note'`,
		);
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.sequelize.query(
			`UPDATE Menus SET menuName = 'Goods Receipt Note' WHERE slug = 'goods-receipt-note'`,
		);
	},
};
