'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('Payments', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			orgId: {
				type: Sequelize.INTEGER,
				references: {
					model: 'organizations',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			customer_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'BusinessPartners',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			type: {
				type: Sequelize.ENUM(['INWARD', 'OUTWARD']),
			},
			receiptPrefix: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			receiptNumber: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			receiptPostfix: {
				type: Sequelize.STRING,
				allowNull: true,
			},

			totalOutstanding: {
				type: Sequelize.DECIMAL(12, 2),
			},
			paymentDate: {
				type: Sequelize.DATE,
				allowNull: false,
			},
			amount: {
				type: Sequelize.DECIMAL(12, 2),
			},
			paymentType: {
				type: Sequelize.ENUM([
					'CASH',
					'CHEQUE',
					'ONLINE',
					'BANK',
					'TDS',
					'BAD DEBTS / KASAR',
					'CURRENCY EXCHANGE LOSS',
				]),
			},
			is_payment_adv: {
				type: Sequelize.BOOLEAN,
				defaultValue: false
			},
			remarks: {
				type: Sequelize.STRING,
				allowNull: true,
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
		await queryInterface.dropTable('Payments');
	},
};
