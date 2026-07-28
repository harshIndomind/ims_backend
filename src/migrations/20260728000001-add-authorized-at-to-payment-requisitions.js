'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('PaymentRequisitions', 'authorized_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('PaymentRequisitions', 'authorized_at');
	},
};
