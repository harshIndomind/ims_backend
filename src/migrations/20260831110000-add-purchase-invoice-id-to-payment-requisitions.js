'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('PaymentRequisitions', 'purchase_invoice_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: { model: 'purchase_invoices', key: 'id' },
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
			after: 'wo_id',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('PaymentRequisitions', 'purchase_invoice_id');
	},
};
