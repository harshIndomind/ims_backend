'use strict';

/**
 * One-time data correction: PurchaseOrders/WorkOrders.totalPaid was previously
 * synced from Payment Requisitions' net_payable (cash actually sent to the
 * vendor), but compared against grandTotal (the order's full value). Since
 * TDS is withheld from every requisitioned rupee, any order with TDS-bearing
 * requisitions could never reach totalPaid = grandTotal, leaving a permanent
 * phantom "outstanding" balance equal to the cumulative TDS — even once 100%
 * of the order's value had been requisitioned.
 *
 * payment-requisition.service.js now syncs totalPaid from gross_amount
 * instead (see poWoSyncAmount's doc comment there for the full rationale).
 * This migration recomputes totalPaid/remainingAmount/paymentStatus for every
 * existing PO/WO to match, using the same SUM(gross_amount of APPROVED
 * REGULAR requisitions) the live code now uses. RETENTION_RELEASE
 * requisitions are correctly excluded, same as in the live sync logic.
 */
module.exports = {
	async up(queryInterface) {
		for (const [table, idCol] of [['PurchaseOrders', 'po_id'], ['WorkOrders', 'wo_id']]) {
			await queryInterface.sequelize.query(`
				UPDATE ${table} t
				JOIN (
					SELECT ${idCol} AS id, SUM(gross_amount) AS total_paid
					FROM PaymentRequisitions
					WHERE requisition_type = 'REGULAR' AND status = 'APPROVED' AND ${idCol} IS NOT NULL
					GROUP BY ${idCol}
				) agg ON agg.id = t.id
				SET
					t.totalPaid = agg.total_paid,
					t.remainingAmount = GREATEST(0, t.grandTotal - agg.total_paid),
					t.paymentStatus = CASE
						WHEN GREATEST(0, t.grandTotal - agg.total_paid) <= 0 THEN 'PAID'
						WHEN agg.total_paid > 0 THEN 'PARTIAL'
						ELSE 'PENDING'
					END
			`);
		}
	},

	async down() {
		// Deliberately irreversible: this corrects previously-wrong data with no
		// stored record of the old (incorrect) totalPaid values to restore.
	},
};
