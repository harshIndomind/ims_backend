'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('purchase_invoice_charges', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			purchase_invoice_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'purchase_invoices',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			charge_type_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: {
					model: 'MasterOtherChargeTypes',
					key: 'id',
				},
			},
			// Free text — required when charge_type is "Other" (or absent), optional
			// specificity otherwise (e.g. "Transportation" + "local cartage, 2 trips").
			description: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			amount: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
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
			total: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
			},
			remarks: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
				defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
			},
			updatedAt: {
				allowNull: true,
				type: Sequelize.DATE,
				defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
			},
		});

		await queryInterface.addIndex('purchase_invoice_charges', ['purchase_invoice_id'], {
			name: 'purchase_invoice_charges_invoice_idx',
		});
	},

	async down(queryInterface) {
		await queryInterface.dropTable('purchase_invoice_charges');
	},
};
