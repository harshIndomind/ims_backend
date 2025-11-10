'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('PaymentInvoices', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			payment_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'Payments',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			invoice_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'Invoices',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			amount_adjusted: {
				type: Sequelize.DECIMAL(12, 2),
			},
			remaining_amount: {
				type: Sequelize.DECIMAL(12, 2),
			},
			selected: {
				type: Sequelize.BOOLEAN,
				defaultValue: false
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
		await queryInterface.dropTable('PaymentInvoices');
	},
};
