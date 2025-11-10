'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('InvoiceCsvImportItems', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.BIGINT,
			},
			invoice_csv_import_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'InvoiceCsvImports',
					key: 'id',
				},
			},
			item_code: { type: Sequelize.STRING, allowNull: true },
			item_name: { type: Sequelize.STRING, allowNull: true },
			description_of_item: { type: Sequelize.TEXT, allowNull: true },

			hsn_sac: { type: Sequelize.STRING, allowNull: true },
			quantity: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			price_unit: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			sub_total: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			item_discount_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			item_discount_percentage: {
				type: Sequelize.DECIMAL(12, 2),
				allowNull: true,
			},
			item_net_price: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			item_cgst_percentage: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			item_cgst_value: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			item_sgst_percentage: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			item_sgst_value: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			item_igst_percentage: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			item_igst_value: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			item_tax_percentage: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
			item_net_total: { type: Sequelize.DECIMAL(12, 2), allowNull: true },

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
		await queryInterface.dropTable('InvoiceCsvImportItems');
	},
};
