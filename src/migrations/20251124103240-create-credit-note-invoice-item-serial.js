'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('CreditNoteInvoiceItemSerials', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			credit_note_invoice_item_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'CreditNoteInvoiceItems',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			serial_no: {
				type: Sequelize.STRING,
				unique: true,
				references: {
					model: 'ProductSerials',
					key: 'serial_no',
				},
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			},
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
			updatedAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
		});
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('CreditNoteInvoiceItemSerials');
	},
};
