'use strict';
/**
 * Corrected business flow: physical goods arrival is captured on the QC inspection itself, not
 * on Acknowledgement (see the preceding migration). `arrived_qty` is renamed to
 * `current_received_qty` — the qty received in THIS delivery/inspection, entered by the
 * inspector — and three new snapshot columns support multi-delivery QC against the same PO/WO
 * line: `ordered_qty` (frozen at inspection creation), `previously_received_qty` (sum of
 * current_received_qty from prior completed/approved inspections on the same po_wo_item_id),
 * and `total_received_qty`/`pending_qty` (derived, recomputed on every items save).
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.renameColumn('qc_inspection_items', 'arrived_qty', 'current_received_qty');

		await queryInterface.addColumn('qc_inspection_items', 'ordered_qty', {
			type: Sequelize.DECIMAL(15, 2),
			allowNull: false,
			defaultValue: 0,
		});
		await queryInterface.addColumn('qc_inspection_items', 'previously_received_qty', {
			type: Sequelize.DECIMAL(15, 2),
			allowNull: false,
			defaultValue: 0,
		});
		await queryInterface.addColumn('qc_inspection_items', 'total_received_qty', {
			type: Sequelize.DECIMAL(15, 2),
			allowNull: false,
			defaultValue: 0,
		});
		await queryInterface.addColumn('qc_inspection_items', 'pending_qty', {
			type: Sequelize.DECIMAL(15, 2),
			allowNull: false,
			defaultValue: 0,
		});

		// Backfill any pre-existing rows: ordered_qty from the source PO/WO item, previously_received_qty
		// left at 0 (no per-item receipt history existed before this migration), total_received_qty
		// mirrors the renamed current_received_qty, pending_qty derived from both.
		await queryInterface.sequelize.query(`
			UPDATE qc_inspection_items qii
			JOIN qc_inspections qi ON qi.id = qii.qc_inspection_id
			LEFT JOIN PurchaseOrderItems poi ON qi.document_type = 'purchase_order' AND poi.id = qii.po_wo_item_id
			LEFT JOIN WorkOrderItems woi ON qi.document_type = 'work_order' AND woi.id = qii.po_wo_item_id
			SET qii.ordered_qty = COALESCE(poi.qty, woi.qty, qii.current_received_qty),
			    qii.total_received_qty = qii.current_received_qty,
			    qii.pending_qty = COALESCE(poi.qty, woi.qty, qii.current_received_qty) - qii.current_received_qty
		`);
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('qc_inspection_items', 'pending_qty');
		await queryInterface.removeColumn('qc_inspection_items', 'total_received_qty');
		await queryInterface.removeColumn('qc_inspection_items', 'previously_received_qty');
		await queryInterface.removeColumn('qc_inspection_items', 'ordered_qty');
		await queryInterface.renameColumn('qc_inspection_items', 'current_received_qty', 'arrived_qty');
	},
};
