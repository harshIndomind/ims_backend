'use strict';

/**
 * Creates the PaymentRequisitionDeductions table.
 *
 * Each row represents a single line-item deduction applied to one PaymentRequisition.
 * Multiple deduction types (TDS, Retention, LD, etc.) are stored as separate rows,
 * making it trivial to add new types without schema changes.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const tableExists = await queryInterface.tableExists('PaymentRequisitionDeductions');

		if (!tableExists) {
			await queryInterface.createTable('PaymentRequisitionDeductions', {
				id: {
					allowNull: false,
					autoIncrement: true,
					primaryKey: true,
					type: Sequelize.INTEGER,
				},
				payment_requisition_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'PaymentRequisitions', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'CASCADE',
				},
				deduction_type: {
					type: Sequelize.ENUM(
						'RETENTION',
						'TDS',
						'SECURITY_DEPOSIT',
						'ADVANCE_RECOVERY',
						'LD',
						'GST_TDS',
						'WCT',
						'OTHER',
					),
					allowNull: false,
				},
				deduction_name: {
					type: Sequelize.STRING(150),
					allowNull: true,
				},
				percentage: {
					type: Sequelize.DECIMAL(5, 2),
					allowNull: true,
					defaultValue: null,
				},
				amount: {
					type: Sequelize.DECIMAL(15, 2),
					allowNull: false,
					defaultValue: 0,
				},
				remarks: {
					type: Sequelize.TEXT,
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
		}

		const indexes = await queryInterface.showIndex('PaymentRequisitionDeductions');
		const indexNames = indexes.map((i) => i.name);

		if (!indexNames.includes('idx_prd_payment_requisition_id')) {
			await queryInterface.addIndex('PaymentRequisitionDeductions', ['payment_requisition_id'], {
				name: 'idx_prd_payment_requisition_id',
			});
		}

		if (!indexNames.includes('idx_prd_deduction_type')) {
			await queryInterface.addIndex('PaymentRequisitionDeductions', ['deduction_type'], {
				name: 'idx_prd_deduction_type',
			});
		}
	},

	async down(queryInterface) {
		await queryInterface.dropTable('PaymentRequisitionDeductions');
	},
};
