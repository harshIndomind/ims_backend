'use strict';

/**
 * One-time backfill: creates a TdsLiability (status UNPAID) for every TDS-type
 * deduction line (TDS / GST_TDS / WCT) that already exists on an APPROVED
 * PaymentRequisition, so historical TDS deductions aren't invisible to the new
 * settlement/reporting screens. We deliberately default status to UNPAID rather
 * than guessing PAID — finance must reconcile these against what has actually
 * already been deposited with the government using the new settlement flow.
 *
 * Only requisitions linked to a PO or WO are backfilled (the only source types
 * that exist today). The unique FK on payment_requisition_deduction_id means
 * this is safe to re-run — INSERT IGNORE skips rows a prior partial run already
 * created.
 */
module.exports = {
	async up(queryInterface) {
		await queryInterface.sequelize.query(`
			INSERT IGNORE INTO TdsLiabilities (
				org_id, source_type, po_id, wo_id, payment_requisition_id,
				payment_requisition_deduction_id, vendor_id, deduction_type,
				base_amount, tds_percentage, tds_amount, amount_settled, status,
				liability_date, created_by_id, createdAt, updatedAt
			)
			SELECT
				pr.org_id,
				CASE WHEN pr.po_id IS NOT NULL THEN 'PO' ELSE 'WO' END,
				pr.po_id,
				pr.wo_id,
				pr.id,
				d.id,
				pr.supplier_id,
				d.deduction_type,
				pr.gross_amount,
				d.percentage,
				d.amount,
				0,
				'UNPAID',
				COALESCE(pr.payment_date, pr.requisition_date),
				pr.fed_by_id,
				NOW(),
				NOW()
			FROM PaymentRequisitionDeductions d
			INNER JOIN PaymentRequisitions pr ON pr.id = d.payment_requisition_id
			WHERE pr.status = 'APPROVED'
			  AND pr.requisition_type = 'REGULAR'
			  AND d.deduction_type IN ('TDS', 'GST_TDS', 'WCT')
			  AND (pr.po_id IS NOT NULL OR pr.wo_id IS NOT NULL)
			  AND d.amount > 0
		`);
	},

	async down(queryInterface) {
		// Irreversible by design: a down-migration here could delete liabilities
		// that have since been (partially) settled through the new UI. Reversing
		// this backfill, if ever needed, must be done by hand after checking
		// amount_settled = 0 on each backfilled row.
	},
};
