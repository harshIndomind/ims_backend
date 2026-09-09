'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('IndentItems', 'item_type', {
			type: Sequelize.ENUM('product', 'service'),
			allowNull: true,
		});

		await queryInterface.sequelize.query(
			"UPDATE IndentItems SET item_type = JSON_UNQUOTE(JSON_EXTRACT(productSnapshot, '$.item_type')) WHERE productSnapshot IS NOT NULL",
		);
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('IndentItems', 'item_type');
	},
};
