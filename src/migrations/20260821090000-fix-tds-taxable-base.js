'use strict';

/**
 * One-time data correction, companion to the code fix in
 * payment-requisition.service.js: percentage-driven TDS/GST_TDS deduction
 * amounts were previously computed on gross_amount (GST-inclusive), but by
 * law (CBDT Circular 23/2017 / Section 51 CGST Act) must be computed on the
 * taxable value only. This recomputes every existing percentage-driven
 * TDS/GST_TDS deduction row using the same ratio-based logic the live code
 * now uses (taxableRatio = PO/WO.total_taxable / grandTotal), then keeps the
 * parent PaymentRequisition's totals and the linked TdsLiability in sync.
 *
 * Liabilities that have already been (partially) settled are deliberately
 * left untouched — rewriting tds_amount/base_amount under an existing
 * settlement would desync it from the real government payment already
 * recorded against it. Those need manual reconciliation if they're wrong,
 * not a silent migration rewrite.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const { QueryTypes } = Sequelize;
		const sequelize = queryInterface.sequelize;

		const rows = await sequelize.query(
			`
			SELECT d.id AS deduction_id, d.percentage, d.amount AS old_amount,
			       pr.id AS pr_id, pr.po_id, pr.wo_id, pr.gross_amount
			FROM PaymentRequisitionDeductions d
			INNER JOIN PaymentRequisitions pr ON pr.id = d.payment_requisition_id
			WHERE d.deduction_type IN ('TDS', 'GST_TDS')
			  AND d.percentage IS NOT NULL AND d.percentage > 0
			  AND (pr.po_id IS NOT NULL OR pr.wo_id IS NOT NULL)
			`,
			{ type: QueryTypes.SELECT },
		);

		const affectedPrIds = new Set();

		for (const row of rows) {
			const table = row.po_id ? 'PurchaseOrders' : 'WorkOrders';
			const orderId = row.po_id || row.wo_id;

			const [order] = await sequelize.query(
				`SELECT total_taxable, grandTotal FROM ${table} WHERE id = :orderId`,
				{ replacements: { orderId }, type: QueryTypes.SELECT },
			);
			if (!order || !order.grandTotal || Number(order.grandTotal) <= 0) continue;

			const ratio = Number(order.total_taxable || 0) / Number(order.grandTotal);
			const taxableBase = Math.round(Number(row.gross_amount) * ratio * 100) / 100;
			const newAmount = Math.round(taxableBase * (Number(row.percentage) / 100) * 100) / 100;

			if (Math.abs(newAmount - Number(row.old_amount)) < 0.005) continue; // already correct

			await sequelize.query(`UPDATE PaymentRequisitionDeductions SET amount = :newAmount WHERE id = :id`, {
				replacements: { newAmount, id: row.deduction_id },
			});

			const [liability] = await sequelize.query(
				`SELECT id, amount_settled FROM TdsLiabilities WHERE payment_requisition_deduction_id = :dedId`,
				{ replacements: { dedId: row.deduction_id }, type: QueryTypes.SELECT },
			);
			if (liability && Number(liability.amount_settled) === 0) {
				await sequelize.query(
					`UPDATE TdsLiabilities SET tds_amount = :newAmount, base_amount = :taxableBase WHERE id = :id`,
					{ replacements: { newAmount, taxableBase, id: liability.id } },
				);
			}

			affectedPrIds.add(row.pr_id);
		}

		for (const prId of affectedPrIds) {
			await sequelize.query(
				`
				UPDATE PaymentRequisitions pr
				JOIN (
					SELECT payment_requisition_id, COALESCE(SUM(amount), 0) AS total
					FROM PaymentRequisitionDeductions
					WHERE payment_requisition_id = :prId
					GROUP BY payment_requisition_id
				) agg ON agg.payment_requisition_id = pr.id
				SET
					pr.total_deductions = agg.total,
					pr.net_payable = GREATEST(0, pr.gross_amount - agg.total),
					pr.tds_amount = agg.total,
					pr.total_amount = GREATEST(0, pr.gross_amount - agg.total)
				WHERE pr.id = :prId
				`,
				{ replacements: { prId } },
			);
		}
	},

	async down() {
		// Deliberately irreversible — see the TDS backfill migration for the same
		// rationale (no stored record of the prior, incorrect values to restore).
	},
};
