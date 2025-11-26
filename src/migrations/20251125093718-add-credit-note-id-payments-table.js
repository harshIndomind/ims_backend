'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.sequelize.query(`
      ALTER TABLE Payments 
      MODIFY COLUMN paymentType ENUM(
        'CASH',
        'CHEQUE',
        'ONLINE',
        'BANK',
        'TDS',
        'BAD DEBTS / KASAR',
        'CURRENCY EXCHANGE LOSS',
        'CREDIT_NOTE',
        'DEBIT_NOTE'
      );
    `);

		await queryInterface.addColumn('Payments', 'credit_note_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: {
				model: 'CreditNoteInvoices',
				key: 'id',
			},
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.sequelize.query(`
      ALTER TABLE Payments 
      MODIFY COLUMN paymentType ENUM(
        'CASH',
        'CHEQUE',
        'ONLINE',
        'BANK',
        'TDS',
        'BAD DEBTS / KASAR',
        'CURRENCY EXCHANGE LOSS'
      );
    `);

		await queryInterface.removeColumn('Payments', 'credit_note_id');
	},
};
