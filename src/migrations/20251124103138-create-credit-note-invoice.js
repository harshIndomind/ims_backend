'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('CreditNoteInvoices', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			invoice_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'Invoices',
					key: 'id',
				},
				allowNull: true,
			},
			orgId: {
				type: Sequelize.INTEGER,
				references: {
					model: 'organizations',
					key: 'id',
				},
				allowNull: true,
			},
			customerId: {
				type: Sequelize.INTEGER,
				references: {
					model: 'BusinessPartners',
					key: 'id',
				},
				allowNull: true,
			},
			bank_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: {
					model: 'OrganizationBankDetails',
					key: 'id',
				},
			},
			invoicePrefix: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			invoiceNo: {
				type: Sequelize.STRING,
				unique: true,
				allowNull: false,
			},
			invoicePostfix: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			dueDate: {
				type: Sequelize.DATE,
				allowNull: true,
			},
			total_taxable: {
				type: Sequelize.DECIMAL(15, 2),
			},
			total_tax: {
				type: Sequelize.DECIMAL(15, 2),
			},
			discount: {
				type: Sequelize.JSON,
			},
			otherTax: {
				type: Sequelize.JSON,
			},
			isRoundOff: {
				type: Sequelize.BOOLEAN,
			},
			grandTotal: {
				type: Sequelize.DECIMAL(15, 2),
			},
			paymentType: {
				type: Sequelize.JSON,
			},
			customerInfo: {
				type: Sequelize.JSON,
			},
			invoiceDetail: {
				type: Sequelize.JSON,
			},
			additionalNotes: {
				type: Sequelize.JSON,
			},
			customFields: { type: Sequelize.JSON, allowNull: true },
			remarks: {
				type: Sequelize.TEXT,
			},
			same_state: {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
			},
			status: {
				type: Sequelize.ENUM(['pending', 'completed']),
				defaultValue: 'pending',
			},
			paymentStatus: {
				type: Sequelize.STRING,
				allowNull: true,
				defaultValue: 'PENDING',
			},
			totalPaid: {
				type: Sequelize.DECIMAL(15, 2),
				defaultValue: 0,
				allowNull: true,
			},
			remainingAmount: {
				type: Sequelize.DECIMAL(15, 2),
				defaultValue: 0,
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
		await queryInterface.dropTable('CreditNoteInvoices');
	},
};
