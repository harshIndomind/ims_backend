'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('PaymentRequisitions', 'bank_details_snapshot', {
			type: Sequelize.JSON,
			allowNull: true,
			after: 'supplier_snapshot',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('PaymentRequisitions', 'bank_details_snapshot');
	},
};
