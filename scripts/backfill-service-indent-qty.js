'use strict';

/**
 * One-time backfill for the service-item Work Order qty ceiling fix.
 *
 * Before this fix, VCP's verify-stock endpoint always reported service indent lines as
 * "fully issued" (nothing ever backorders for a service), so approveIndent always left
 * IndentItem.qty_for_purchase_order at 0 for every service line. work-order.service.js
 * also never enforced or decremented that field for services (an isServiceItem guard
 * skipped it everywhere). Both are now fixed going forward (see indent.service.js's
 * approveIndent and work-order.service.js), but every already-approved service
 * IndentItem row is still stuck at qty_for_purchase_order = 0 — which, now that Work
 * Order create/update enforce the cap unconditionally, would make it impossible to
 * raise ANY new Work Order against such a line (even one that never had a WO raised
 * against it at all), not just ones that are legitimately already fully committed.
 *
 * This script recomputes the correct value for every such row:
 *
 *   qty_for_purchase_order = qty_issued - Σ(qty committed by active WorkOrderItems
 *                                            against this indent_id + product_id)
 *
 * "Active" WorkOrder = status NOT IN ('cancelled', 'rejected') — the same convention
 * applyIndentQtyDeltaForWorkOrder's live qty ledger already uses. A line with an
 * existing WO consuming all of qty_issued correctly ends up at 0 (stays blocked); a
 * line with no WO yet, or a partially-consumed one, opens up to its real remainder.
 *
 * balance_indent_qty is deliberately left untouched (stays 0 for services) — that
 * counter is the GRN/stock-return-specific Reissue Pending Quantity mechanism, which
 * has no equivalent for labor; Short Close is the release mechanism for services.
 *
 * Idempotent — always recomputes from source (qty_issued minus a live sum), never
 * increments, so re-running it is safe and yields the same result.
 *
 * Usage:
 *   node scripts/backfill-service-indent-qty.js            # applies the fix
 *   node scripts/backfill-service-indent-qty.js --dry-run   # logs what would change, no writes
 */

const { sequelize, IndentItem, Indent, WorkOrder, WorkOrderItem } = require('../src/models/index');
const { Op } = require('sequelize');

const DRY_RUN = process.argv.includes('--dry-run');
const INACTIVE_WO_STATUSES = ['cancelled', 'rejected'];

function roundQty(value) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function run() {
	const serviceItems = await IndentItem.findAll({
		where: { item_type: 'service' },
		include: [{ model: Indent, as: 'indent', where: { status: 'approved' }, attributes: ['id', 'org_id', 'indent_no'] }],
	});

	console.log(`Found ${serviceItems.length} approved service indent line(s) to check.\n`);

	let changed = 0;
	let unchanged = 0;
	const rows = [];

	for (const item of serviceItems) {
		const committed = await WorkOrderItem.sum('qty', {
			where: { product_id: item.product_id },
			include: [
				{
					model: WorkOrder,
					as: 'workOrder',
					attributes: [],
					where: {
						indent_id: item.indent_id,
						status: { [Op.notIn]: INACTIVE_WO_STATUSES },
					},
				},
			],
		});

		const qtyIssued = parseFloat(item.qty_issued || 0);
		const newQty = roundQty(Math.max(0, qtyIssued - (committed || 0)));
		const oldQty = parseFloat(item.qty_for_purchase_order || 0);

		rows.push({
			indent_id: item.indent_id,
			indent_no: item.indent?.indent_no ?? null,
			indent_item_id: item.id,
			product_id: item.product_id,
			qty_issued: qtyIssued,
			committed_by_wo: committed || 0,
			old_qty_for_purchase_order: oldQty,
			new_qty_for_purchase_order: newQty,
		});

		if (Math.abs(newQty - oldQty) > 0.001) {
			changed += 1;
			if (!DRY_RUN) {
				await item.update({ qty_for_purchase_order: newQty });
			}
		} else {
			unchanged += 1;
		}
	}

	console.table(rows);
	console.log(
		`\n${DRY_RUN ? '[dry run] Would update' : 'Updated'} ${changed} row(s); ${unchanged} already correct.`,
	);
}

run()
	.then(() => sequelize.close())
	.catch((err) => {
		console.error('Backfill failed:', err);
		return sequelize.close().finally(() => process.exit(1));
	});
