'use strict';

/**
 * Creates the TdsLiabilities table.
 *
 * One row per TDS-type deduction line (TDS / GST_TDS / WCT) on an APPROVED
 * PaymentRequisition. Created when the parent requisition transitions to
 * APPROVED (not at PR-creation time, since a PENDING/REJECTED requisition
 * never actually withholds money). The unique FK on
 * payment_requisition_deduction_id makes liability creation idempotent —
 * a reject-then-re-approve cycle can never double-create a liability for
 * the same deduction line.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const tableExists = await queryInterface.tableExists('TdsLiabilities');

		if (!tableExists) {
			await queryInterface.createTable('TdsLiabilities', {
				id: {
					allowNull: false,
					autoIncrement: true,
					primaryKey: true,
					type: Sequelize.INTEGER,
				},
				org_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'organizations', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'CASCADE',
				},
				source_type: {
					type: Sequelize.ENUM('PO', 'WO'),
					allowNull: false,
				},
				po_id: {
					type: Sequelize.INTEGER,
					allowNull: true,
					references: { model: 'PurchaseOrders', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'SET NULL',
				},
				wo_id: {
					type: Sequelize.INTEGER,
					allowNull: true,
					references: { model: 'WorkOrders', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'SET NULL',
				},
				payment_requisition_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'PaymentRequisitions', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'RESTRICT',
				},
				payment_requisition_deduction_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					unique: true,
					references: { model: 'PaymentRequisitionDeductions', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'RESTRICT',
				},
				vendor_id: {
					type: Sequelize.INTEGER,
					allowNull: true,
				},
				vendor_snapshot: {
					type: Sequelize.JSON,
					allowNull: true,
				},
				deduction_type: {
					type: Sequelize.ENUM('TDS', 'GST_TDS', 'WCT'),
					allowNull: false,
				},
				section_code: {
					type: Sequelize.STRING(20),
					allowNull: true,
				},
				base_amount: {
					type: Sequelize.DECIMAL(15, 2),
					allowNull: false,
					defaultValue: 0,
				},
				tds_percentage: {
					type: Sequelize.DECIMAL(5, 2),
					allowNull: true,
				},
				tds_amount: {
					type: Sequelize.DECIMAL(15, 2),
					allowNull: false,
					defaultValue: 0,
				},
				amount_settled: {
					type: Sequelize.DECIMAL(15, 2),
					allowNull: false,
					defaultValue: 0,
				},
				status: {
					type: Sequelize.ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'),
					allowNull: false,
					defaultValue: 'UNPAID',
				},
				liability_date: {
					type: Sequelize.DATEONLY,
					allowNull: false,
				},
				cancelled_at: {
					type: Sequelize.DATE,
					allowNull: true,
				},
				cancelled_by_id: {
					type: Sequelize.INTEGER,
					allowNull: true,
				},
				cancellation_reason: {
					type: Sequelize.TEXT,
					allowNull: true,
				},
				created_by_id: {
					type: Sequelize.INTEGER,
					allowNull: true,
				},
				updated_by_id: {
					type: Sequelize.INTEGER,
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

		const indexes = await queryInterface.showIndex('TdsLiabilities');
		const indexNames = indexes.map((i) => i.name);

		const wantedIndexes = [
			{ name: 'idx_tds_liab_org_status', fields: ['org_id', 'status'] },
			{ name: 'idx_tds_liab_po_id', fields: ['po_id'] },
			{ name: 'idx_tds_liab_wo_id', fields: ['wo_id'] },
			{ name: 'idx_tds_liab_pr_id', fields: ['payment_requisition_id'] },
			{ name: 'idx_tds_liab_vendor_date', fields: ['vendor_id', 'liability_date'] },
			{ name: 'idx_tds_liab_date', fields: ['liability_date'] },
		];

		for (const idx of wantedIndexes) {
			if (!indexNames.includes(idx.name)) {
				await queryInterface.addIndex('TdsLiabilities', idx.fields, { name: idx.name });
			}
		}
	},

	async down(queryInterface) {
		await queryInterface.dropTable('TdsLiabilities');
	},
};
