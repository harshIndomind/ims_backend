'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('PurchaseOrderItems', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			purchase_order_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'PurchaseOrders',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			budget_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'Budgets',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			budget_no: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			product_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			productSnapshot: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			batch_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			batchSnapshot: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			selected_uom_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			uomSnapshot: {
				type: Sequelize.JSON,
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
				allowNull: true,
			},
			taxSnapshot: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			igst: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
			cgst: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
			sgst: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
			cess: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
			total: Sequelize.DECIMAL(15, 2),
			stock_type: Sequelize.ENUM(['normal', 'batch', 'serial']),
			note: { type: Sequelize.TEXT, allowNull: true },
			specification: { type: Sequelize.TEXT, allowNull: true },
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
		await queryInterface.dropTable('PurchaseOrderItems');
	},
};
