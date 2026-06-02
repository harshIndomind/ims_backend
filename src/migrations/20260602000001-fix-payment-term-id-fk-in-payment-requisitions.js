'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		// Remove the incorrectly created FK that pointed to MasterTransporters
		await queryInterface.removeConstraint(
			'PaymentRequisitions',
			'PaymentRequisitions_payment_term_id_foreign_idx',
		);

		// Add the correct FK pointing to MasterTermsConditions
		await queryInterface.addConstraint('PaymentRequisitions', {
			fields: ['payment_term_id'],
			type: 'foreign key',
			name: 'PaymentRequisitions_payment_term_id_foreign_idx',
			references: {
				table: 'MasterTermsConditions',
				field: 'id',
			},
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeConstraint(
			'PaymentRequisitions',
			'PaymentRequisitions_payment_term_id_foreign_idx',
		);

		await queryInterface.addConstraint('PaymentRequisitions', {
			fields: ['payment_term_id'],
			type: 'foreign key',
			name: 'PaymentRequisitions_payment_term_id_foreign_idx',
			references: {
				table: 'MasterTransporters',
				field: 'id',
			},
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
		});
	},
};
