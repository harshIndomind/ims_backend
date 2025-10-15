'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.removeColumn('Products', 'product_group_id');
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.addColumn('Products', 'product_group_id', {
			type: Sequelize.BIGINT,
			allowNull: true,
		});
	},
};
