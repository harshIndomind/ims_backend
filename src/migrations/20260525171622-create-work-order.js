'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('WorkOrders', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_id: {
				type: Sequelize.INTEGER,
				references: { model: 'organizations', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			indent_id: {
				type: Sequelize.INTEGER,
				references: { model: 'Indents', key: 'id' },
				allowNull: true,
				onDelete: 'CASCADE',
			},
			vendorId: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			bank_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			bankSnapshot: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			woPrefix: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			woNo: {
				type: Sequelize.STRING,
				unique: true,
				allowNull: false,
			},
			woPostfix: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			dueDate: {
				type: Sequelize.DATEONLY,
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
			vendorInfo: {
				type: Sequelize.JSON,
			},
			woDetail: {
				type: Sequelize.JSON,
			},
			additionalNotes: {
				type: Sequelize.JSON,
			},
			customFields: {
				type: Sequelize.JSON,
				allowNull: true,
			},
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
			wo_qc_check: {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
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
			payment_term_value: {
				type: Sequelize.DECIMAL(5, 2),
				allowNull: true,
				defaultValue: null,
			},
			payment_term_amount: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: true,
				defaultValue: null,
			},
			delivery_term_id: {
				type: Sequelize.INTEGER,
			},
			delivery_term_days: {
				type: Sequelize.INTEGER,
				allowNull: true,
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
			start_date: {
				type: Sequelize.DATEONLY,
				allowNull: true,
			},
			end_date: {
				type: Sequelize.DATEONLY,
				allowNull: true,
			},
			retention: {
				type: Sequelize.DECIMAL(5, 2),
				allowNull: true,
			},
			retention_amount: {
				type: Sequelize.DECIMAL(15, 2),
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
		await queryInterface.dropTable('WorkOrders');
	},
};
