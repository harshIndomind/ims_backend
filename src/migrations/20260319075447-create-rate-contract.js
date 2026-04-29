'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('RateContracts', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'organizations',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			supplier_id: {
				type: Sequelize.INTEGER,
			},
			supplierSnapshot: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			product_id: {
				type: Sequelize.INTEGER,
			},
			productSnapshot: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			contract_subject: {
				type: Sequelize.STRING,
			},
			universal_code: {
				type: Sequelize.STRING,
			},
			uom_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			specification: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			contract_rate: {
				type: Sequelize.DOUBLE,
				defaultValue: 0,
			},
			discount: {
				type: Sequelize.DOUBLE,
				defaultValue: 0,
			},
			special_discount: {
				type: Sequelize.DOUBLE,
				defaultValue: 0,
			},
			special_discount_details: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			effective_date: {
				type: Sequelize.DATEONLY,
			},
			end_date: {
				type: Sequelize.DATEONLY,
			},
			price_term_id: {
				type: Sequelize.INTEGER,
			},
			gst_term_id: {
				type: Sequelize.INTEGER,
			},
			payment_term_id: {
				type: Sequelize.INTEGER,
			},
			delivery_term_id: {
				type: Sequelize.INTEGER,
			},
			pf_term_id: {
				type: Sequelize.INTEGER,
			},
			ld_clause_term_id: {
				type: Sequelize.INTEGER,
			},
			dispatch_id: {
				type: Sequelize.INTEGER,
			},
			others: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
				defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
			},
			updatedAt: {
				allowNull: false,
				type: Sequelize.DATE,
				defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
			},
		});
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('RateContracts');
	},
};
