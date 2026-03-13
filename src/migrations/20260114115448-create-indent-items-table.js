'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('IndentItems', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			indent_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'Indents', key: 'id' },
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
			},
			budget_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'Budgets', key: 'id' },
			},
			product_id: {
				type: Sequelize.INTEGER,
			},
			batch_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			model_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			item_name: {
				type: Sequelize.STRING(200),
				allowNull: true,
			},
			item_code: {
				type: Sequelize.STRING(200),
				allowNull: true,
			},
			productSnapshot: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			uom_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			uom_name: {
				type: Sequelize.STRING(50),
				allowNull: true,
			},
			qty: {
				type: Sequelize.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			avg_rate: {
				type: Sequelize.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			discount: {
				type: Sequelize.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			amount: {
				type: Sequelize.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			requested_qty: {
				type: Sequelize.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			qty_issued: {
				type: Sequelize.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			minimum_stock_quantity: {
				type: Sequelize.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			checkMinimumStock: {
				type: Sequelize.BOOLEAN,
				defaultValue: 0,
			},
			qty_for_purchase_order: {
				type: Sequelize.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			qty_updated_by_verifier: {
				type: Sequelize.DOUBLE,
				allowNull: true,
				defaultValue: 0,
			},
			stock_type: {
				type: Sequelize.STRING(50),
				allowNull: true,
			},
			days: {
				type: Sequelize.INTEGER,
				defaultValue: 0,
			},
			specification: {
				type: Sequelize.STRING(200),
				allowNull: true,
			},
			issue_date: {
				type: Sequelize.DATE,
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

	async down(queryInterface) {
		await queryInterface.dropTable('IndentItems');
	},
};
