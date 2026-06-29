'use strict';

/**
 * One-time backfill: the ADD COLUMN migration defaults balance_indent_qty to 0 for every
 * existing row, but IndentItems approved before this column existed may still have an
 * outstanding qty_for_purchase_order that's genuinely owed to the requester — without this,
 * those pre-existing backorders would silently look fully resolved and never surface in the
 * re-issue flow. Idempotent: only touches rows where balance_indent_qty is still at its
 * default (0/NULL), so re-running this after some re-issuing has already happened is a no-op.
 */
module.exports = {
	async up(queryInterface) {
		await queryInterface.sequelize.query(
			`UPDATE IndentItems
			 SET balance_indent_qty = qty_for_purchase_order
			 WHERE qty_for_purchase_order > 0
			   AND (balance_indent_qty IS NULL OR balance_indent_qty = 0)`,
		);
	},

	async down() {
		// Not reversible without knowing how much (if any) has already been re-issued since —
		// intentionally a no-op.
	},
};
