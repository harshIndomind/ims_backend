'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('PaymentRequisitions', 'payment_type', {
			type: Sequelize.ENUM('CASH', 'NEFT', 'UPI', 'IMPS', 'RTGS', 'CHEQUE'),
			allowNull: true,
			after: 'term_condition',
		});
		await queryInterface.addColumn('PaymentRequisitions', 'transaction_id', {
			type: Sequelize.STRING(100),
			allowNull: true,
			after: 'payment_type',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('PaymentRequisitions', 'transaction_id');
		await queryInterface.removeColumn('PaymentRequisitions', 'payment_type');
	},
};
