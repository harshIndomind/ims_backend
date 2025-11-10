'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('InvoiceItems', {
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
				onDelete: 'CASCADE',
			},
			product_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'Products',
					key: 'id',
				},
				onDelete: 'CASCADE',
				allowNull: true,
			},
			batch_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'ProductBatches',
					key: 'id',
				},
				allowNull: true,
			},
			hsn_sac_code: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			qty: {
				type: Sequelize.DECIMAL(15, 2),
			},
			price: {
				type: Sequelize.DECIMAL(15, 2),
			},
			discount: {
				type: Sequelize.DECIMAL(15, 2),
			},
			discount_price_type: {
				type: Sequelize.ENUM(['rupee', 'percentage']),
			},
			tax_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'Taxes',
					key: 'id',
				},
				onDelete: 'CASCADE',
				allowNull: true,
			},
			igst: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
			cgst: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
			sgst: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
			cess: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
			total: Sequelize.DECIMAL(15, 2),
			stock_type: Sequelize.ENUM(['normal', 'batch', 'serial']),
			note: { type: Sequelize.TEXT, allowNull: true },
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
		await queryInterface.dropTable('InvoiceItems');
	},
};
