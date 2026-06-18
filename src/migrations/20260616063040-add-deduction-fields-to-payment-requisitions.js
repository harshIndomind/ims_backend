'use strict';

/**
 * Adds three computed summary columns and a requisition_type discriminator to PaymentRequisitions.
 *
 * gross_amount    — the billable amount before any deductions (mirrors requisition_amount)
 * total_deductions — SUM of all PaymentRequisitionDeductions.amount for this row
 * net_payable     — gross_amount - total_deductions (actual cash out to vendor)
 * requisition_type — REGULAR | RETENTION_RELEASE
 *
 * tds_percent and tds_amount are intentionally left in place for backward compatibility.
 * They will be deprecated but not dropped until the data migration confirms all rows
 * have corresponding deduction child records.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const cols = await queryInterface.describeTable('PaymentRequisitions');

		if (!cols.requisition_type) {
			await queryInterface.addColumn('PaymentRequisitions', 'requisition_type', {
				type: Sequelize.ENUM('REGULAR', 'RETENTION_RELEASE'),
				allowNull: false,
				defaultValue: 'REGULAR',
				after: 'requisition_against',
			});
		}

		if (!cols.gross_amount) {
			await queryInterface.addColumn('PaymentRequisitions', 'gross_amount', {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
				after: 'wo_po_amount',
			});
		}

		if (!cols.total_deductions) {
			await queryInterface.addColumn('PaymentRequisitions', 'total_deductions', {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
				after: 'gross_amount',
			});
		}

		if (!cols.net_payable) {
			await queryInterface.addColumn('PaymentRequisitions', 'net_payable', {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
				after: 'total_deductions',
			});
		}

		// Back-fill gross_amount and net_payable from the existing legacy columns
		// so old rows are immediately consistent with the new schema.
		await queryInterface.sequelize.query(`
			UPDATE PaymentRequisitions
			SET
				gross_amount    = COALESCE(requisition_amount, 0),
				total_deductions = COALESCE(tds_amount, 0),
				net_payable     = COALESCE(total_amount, COALESCE(requisition_amount, 0) - COALESCE(tds_amount, 0))
			WHERE gross_amount = 0
		`);

		const indexes = await queryInterface.showIndex('PaymentRequisitions');
		const indexNames = indexes.map((i) => i.name);

		if (!indexNames.includes('idx_pr_po_id_status_type')) {
			await queryInterface.addIndex('PaymentRequisitions', ['po_id', 'status', 'requisition_type'], {
				name: 'idx_pr_po_id_status_type',
			});
		}

		if (!indexNames.includes('idx_pr_wo_id_status_type')) {
			await queryInterface.addIndex('PaymentRequisitions', ['wo_id', 'status', 'requisition_type'], {
				name: 'idx_pr_wo_id_status_type',
			});
		}
	},

	async down(queryInterface) {
		// Fetch the actual FK constraint names on po_id and wo_id so we can
		// temporarily drop them (MySQL won't drop an index backing a FK).
		const [fkRows] = await queryInterface.sequelize.query(`
			SELECT kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME,
			       kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
			       rc.UPDATE_RULE, rc.DELETE_RULE
			FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
			JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
			    ON  rc.CONSTRAINT_NAME   = kcu.CONSTRAINT_NAME
			    AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
			WHERE kcu.TABLE_NAME        = 'PaymentRequisitions'
			  AND kcu.TABLE_SCHEMA      = DATABASE()
			  AND kcu.COLUMN_NAME       IN ('po_id', 'wo_id')
			  AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
		`);

		for (const row of fkRows) {
			await queryInterface.sequelize.query(
				`ALTER TABLE PaymentRequisitions DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``,
			);
		}

		const indexes = await queryInterface.showIndex('PaymentRequisitions');
		const existingNames = new Set(indexes.map((i) => i.name));

		for (const name of ['idx_pr_po_id_status_type', 'idx_pr_wo_id_status_type', 'idx_pr_po_id_fk_temp', 'idx_pr_wo_id_fk_temp']) {
			if (existingNames.has(name)) {
				await queryInterface.removeIndex('PaymentRequisitions', name);
			}
		}

		await queryInterface.removeColumn('PaymentRequisitions', 'net_payable');
		await queryInterface.removeColumn('PaymentRequisitions', 'total_deductions');
		await queryInterface.removeColumn('PaymentRequisitions', 'gross_amount');
		await queryInterface.removeColumn('PaymentRequisitions', 'requisition_type');

		// Restore FK constraints (MySQL auto-creates supporting indexes).
		for (const row of fkRows) {
			await queryInterface.sequelize.query(`
				ALTER TABLE PaymentRequisitions
				ADD CONSTRAINT \`${row.CONSTRAINT_NAME}\`
				FOREIGN KEY (\`${row.COLUMN_NAME}\`)
				REFERENCES \`${row.REFERENCED_TABLE_NAME}\` (\`${row.REFERENCED_COLUMN_NAME}\`)
				ON UPDATE ${row.UPDATE_RULE}
				ON DELETE ${row.DELETE_RULE}
			`);
		}
	},
};
