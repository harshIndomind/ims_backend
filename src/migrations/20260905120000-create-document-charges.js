'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('document_charges', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			// Polymorphic against purchase_orders/work_orders (and, later, any other document
			// the charge-tax engine is extended to — e.g. purchase_invoices — just by adding an
			// enum value here, no schema rework), same convention as
			// short_close_requests/qc_inspections.document_type.
			document_type: {
				type: Sequelize.ENUM('purchase_order', 'work_order'),
				allowNull: false,
			},
			document_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			name: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			calculation_type: {
				type: Sequelize.ENUM('FIXED', 'PERCENTAGE'),
				allowNull: false,
			},
			value: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			operation: {
				type: Sequelize.ENUM('+', '-'),
				allowNull: false,
				defaultValue: '+',
			},
			// Ordering/base concept only (pre-tax vs post-tax) — deliberately independent of
			// tax_treatment below, per the charge-tax engine's explicit "before/after tax is not
			// the same axis as taxable/non-taxable" rule.
			apply_on: {
				type: Sequelize.ENUM('NET_TAXABLE_AMOUNT', 'AFTER_TAX'),
				allowNull: false,
				defaultValue: 'AFTER_TAX',
			},
			tax_treatment: {
				type: Sequelize.ENUM('NON_TAXABLE', 'SPECIFIC_RATE', 'INHERIT_ITEM_TAX'),
				allowNull: false,
				defaultValue: 'NON_TAXABLE',
			},
			tax_rate: {
				type: Sequelize.DECIMAL(5, 2),
				allowNull: true,
			},
			sequence: {
				type: Sequelize.INTEGER,
				allowNull: false,
				defaultValue: 0,
			},
			// Persisted computed breakdown from charge-tax-engine.util.js at save time — avoids
			// re-deriving historical documents' figures if the engine's math ever evolves, same
			// "snapshot what was actually charged" convention as PurchaseOrderItem.taxSnapshot.
			taxable_amount: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			cgst: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			sgst: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			igst: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			cess: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			total: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
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
		await queryInterface.addIndex('document_charges', ['document_type', 'document_id']);
	},
	async down(queryInterface) {
		await queryInterface.dropTable('document_charges');
	},
};
