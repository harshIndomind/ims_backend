/**
 * Aggregation queries for payment requisition reporting against a PO or WO.
 *
 * All queries intentionally use raw SQL via sequelize.query so the JOINs and
 * GROUP BYs are explicit and auditable by the finance team.
 */

const { sequelize } = require('../models/index');
const { QueryTypes } = require('sequelize');

/**
 * Returns financial totals for every approved/pending requisition against a PO or WO.
 *
 * Columns returned:
 *   total_gross        — sum of gross_amount across all non-rejected requisitions
 *   total_net_paid     — sum of net_payable of APPROVED REGULAR requisitions
 *   total_retention_released — sum of gross_amount of APPROVED RETENTION_RELEASE requisitions
 *   total_deductions   — sum of total_deductions across all non-rejected requisitions
 *   requisition_count  — count of non-rejected requisitions
 *   pending_count      — count of PENDING requisitions
 */
exports.getPoWoFinancialSummary = async ({ idField, id, org_id }) => {
	const rows = await sequelize.query(
		`
		SELECT
			COUNT(id)                                                              AS requisition_count,
			SUM(CASE WHEN status != 'REJECTED' THEN 1 ELSE 0 END)                 AS non_rejected_count,
			SUM(CASE WHEN status = 'PENDING'   THEN 1 ELSE 0 END)                 AS pending_count,
			COALESCE(SUM(CASE WHEN status != 'REJECTED' AND requisition_type = 'REGULAR'
				THEN gross_amount ELSE 0 END), 0)                                  AS total_gross,
			COALESCE(SUM(CASE WHEN status = 'APPROVED'  AND requisition_type = 'REGULAR'
				THEN net_payable  ELSE 0 END), 0)                                  AS total_net_paid,
			COALESCE(SUM(CASE WHEN status = 'APPROVED'  AND requisition_type = 'RETENTION_RELEASE'
				THEN gross_amount ELSE 0 END), 0)                                  AS total_retention_released,
			COALESCE(SUM(CASE WHEN status != 'REJECTED' AND requisition_type = 'REGULAR'
				THEN total_deductions ELSE 0 END), 0)                              AS total_deductions
		FROM PaymentRequisitions
		WHERE ${idField} = :id AND org_id = :org_id
		`,
		{ replacements: { id, org_id }, type: QueryTypes.SELECT, plain: true },
	);

	return rows;
};

/**
 * Returns the total deducted amount broken down by deduction_type for a PO or WO.
 * Only counts deductions on non-rejected requisitions.
 *
 * Useful for: "How much TDS has been deducted against PO #101?"
 */
exports.getDeductionBreakdownByPoWo = async ({ idField, id, org_id }) => {
	return sequelize.query(
		`
		SELECT
			d.deduction_type,
			d.deduction_name,
			COUNT(d.id)                AS deduction_count,
			SUM(d.amount)              AS total_amount,
			AVG(d.percentage)          AS avg_percentage
		FROM PaymentRequisitionDeductions d
		INNER JOIN PaymentRequisitions pr ON pr.id = d.payment_requisition_id
		WHERE pr.${idField} = :id
		  AND pr.org_id     = :org_id
		  AND pr.status    != 'REJECTED'
		  AND pr.requisition_type = 'REGULAR'
		GROUP BY d.deduction_type, d.deduction_name
		ORDER BY d.deduction_type
		`,
		{ replacements: { id, org_id }, type: QueryTypes.SELECT },
	);
};

/**
 * Returns retention status for a PO or WO:
 *   retention_held    — total RETENTION deductions withheld (non-rejected)
 *   retention_released — total from RETENTION_RELEASE requisitions (approved)
 *   retention_balance  — held minus released (still locked with org)
 */
exports.getRetentionSummary = async ({ idField, id, org_id, transaction }) => {
	const held = await sequelize.query(
		`
		SELECT COALESCE(SUM(d.amount), 0) AS retention_held
		FROM PaymentRequisitionDeductions d
		INNER JOIN PaymentRequisitions pr ON pr.id = d.payment_requisition_id
		WHERE pr.${idField}        = :id
		  AND pr.org_id            = :org_id
		  AND pr.status           != 'REJECTED'
		  AND pr.requisition_type  = 'REGULAR'
		  AND d.deduction_type     = 'RETENTION'
		`,
		{ replacements: { id, org_id }, type: QueryTypes.SELECT, plain: true, transaction },
	);

	const released = await sequelize.query(
		`
		SELECT COALESCE(SUM(gross_amount), 0) AS retention_released
		FROM PaymentRequisitions
		WHERE ${idField}       = :id
		  AND org_id           = :org_id
		  AND status           = 'APPROVED'
		  AND requisition_type = 'RETENTION_RELEASE'
		`,
		{ replacements: { id, org_id }, type: QueryTypes.SELECT, plain: true, transaction },
	);

	const retentionHeld = parseFloat(held?.retention_held || 0);
	const retentionReleased = parseFloat(released?.retention_released || 0);

	return {
		retention_held: retentionHeld,
		retention_released: retentionReleased,
		retention_balance: Math.max(0, retentionHeld - retentionReleased),
	};
};

/**
 * Same held/released/balance computation as getRetentionSummary, but for many
 * PO/WO ids at once (one GROUP BY query each instead of N single-id queries) —
 * built for list pages that need a per-row retention indicator without an
 * N+1 query per row.
 *
 * Returns a plain object keyed by id: { [id]: { retention_held, retention_released, retention_balance } }.
 * Ids with no retention activity at all are simply absent from the result —
 * callers should default to zeros.
 */
exports.getRetentionSummaryBulk = async ({ idField, ids, org_id }) => {
	if (!ids || ids.length === 0) return {};

	const heldRows = await sequelize.query(
		`
		SELECT pr.${idField} AS order_id, COALESCE(SUM(d.amount), 0) AS retention_held
		FROM PaymentRequisitionDeductions d
		INNER JOIN PaymentRequisitions pr ON pr.id = d.payment_requisition_id
		WHERE pr.${idField}        IN (:ids)
		  AND pr.org_id            = :org_id
		  AND pr.status           != 'REJECTED'
		  AND pr.requisition_type  = 'REGULAR'
		  AND d.deduction_type     = 'RETENTION'
		GROUP BY pr.${idField}
		`,
		{ replacements: { ids, org_id }, type: QueryTypes.SELECT },
	);

	const releasedRows = await sequelize.query(
		`
		SELECT ${idField} AS order_id, COALESCE(SUM(gross_amount), 0) AS retention_released
		FROM PaymentRequisitions
		WHERE ${idField}       IN (:ids)
		  AND org_id           = :org_id
		  AND status           = 'APPROVED'
		  AND requisition_type = 'RETENTION_RELEASE'
		GROUP BY ${idField}
		`,
		{ replacements: { ids, org_id }, type: QueryTypes.SELECT },
	);

	const result = {};
	for (const row of heldRows) {
		result[row.order_id] = { retention_held: parseFloat(row.retention_held) || 0, retention_released: 0 };
	}
	for (const row of releasedRows) {
		result[row.order_id] = {
			retention_held: result[row.order_id]?.retention_held || 0,
			retention_released: parseFloat(row.retention_released) || 0,
		};
	}
	for (const id of Object.keys(result)) {
		const { retention_held, retention_released } = result[id];
		result[id].retention_balance = Math.max(0, retention_held - retention_released);
	}

	return result;
};

/**
 * Returns full requisition-level detail with per-row deduction breakdown.
 * Used for audit and reporting screens.
 */
exports.getFullLedgerByPoWo = async ({ idField, id, org_id }) => {
	return sequelize.query(
		`
		SELECT
			pr.id,
			pr.requisition_no,
			pr.requisition_date,
			pr.requisition_type,
			pr.status,
			pr.gross_amount,
			pr.total_deductions,
			pr.net_payable,
			d.deduction_type,
			d.deduction_name,
			d.percentage  AS deduction_percentage,
			d.amount      AS deduction_amount
		FROM PaymentRequisitions pr
		LEFT JOIN PaymentRequisitionDeductions d ON d.payment_requisition_id = pr.id
		WHERE pr.${idField} = :id AND pr.org_id = :org_id
		ORDER BY pr.requisition_date ASC, pr.id ASC, d.id ASC
		`,
		{ replacements: { id, org_id }, type: QueryTypes.SELECT },
	);
};
