'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('InvoiceCsvImports', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			voucher_type: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			uploaded_file_name: { type: Sequelize.TEXT, allowNull: true },
			organization_code: { type: Sequelize.STRING, allowNull: true },
			vendor_code: { type: Sequelize.STRING, allowNull: true },
			company_name: { type: Sequelize.STRING, allowNull: true },
			invoice_no: { type: Sequelize.STRING, allowNull: true },
			invoice_date: { type: Sequelize.DATE, allowNull: true },
			ack_no: { type: Sequelize.STRING, allowNull: true },
			ack_date: { type: Sequelize.DATE, allowNull: true },
			due_date: { type: Sequelize.DATE, allowNull: true },
			cgst: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			sgst: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			total_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			seller_contact_no: { type: Sequelize.STRING, allowNull: true },
			seller_email_address: { type: Sequelize.STRING, allowNull: true },
			seller_cin: { type: Sequelize.STRING, allowNull: true },
			seller_gstin: { type: Sequelize.STRING, allowNull: true },
			seller_pan: { type: Sequelize.STRING, allowNull: true },
			account_holder_name: { type: Sequelize.STRING, allowNull: true },
			seller_bank_name: { type: Sequelize.STRING, allowNull: true },
			seller_account_no: { type: Sequelize.STRING, allowNull: true },
			seller_ifsc_code: { type: Sequelize.STRING, allowNull: true },
			seller_address: { type: Sequelize.STRING, allowNull: true },
			seller_state: { type: Sequelize.STRING, allowNull: true },
			seller_district: { type: Sequelize.STRING, allowNull: true },
			seller_pin_code: { type: Sequelize.STRING, allowNull: true },
			place_of_supply: { type: Sequelize.STRING, allowNull: true },
			bill_to_ship_To: { type: Sequelize.STRING, allowNull: true },
			buyer_email_address: { type: Sequelize.STRING, allowNull: true },
			buyer_gstin: { type: Sequelize.STRING, allowNull: true },
			buyer_contact_no: { type: Sequelize.STRING, allowNull: true },
			billing_buyer_address: { type: Sequelize.STRING, allowNull: true },
			buyer_state: { type: Sequelize.STRING, allowNull: true },
			buyer_district: { type: Sequelize.STRING, allowNull: true },
			buyer_pin_code: { type: Sequelize.STRING, allowNull: true },
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
		await queryInterface.dropTable('InvoiceCsvImports');
	},
};
