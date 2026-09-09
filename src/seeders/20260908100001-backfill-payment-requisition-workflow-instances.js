'use strict';

/**
 * One-time backfill: every PaymentRequisition row that existed before this workflow definition
 * shipped needs a workflow_instances row, or the new /workflow endpoint and view-page timeline
 * would show nothing for historical records. Mirrors
 * 20260627000012-backfill-indent-workflow-instances.js.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const [definition] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_definitions WHERE document_type = 'payment_requisition' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (!definition) return;

		const [approverStage] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_stages WHERE workflow_definition_id = ${definition.id} AND stage_key = 'pr_approver_l1' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		const requisitions = await queryInterface.sequelize.query(
			`SELECT pr.id, pr.org_id, pr.status, pr.createdAt, pr.updatedAt FROM PaymentRequisitions pr
			 WHERE NOT EXISTS (
			   SELECT 1 FROM workflow_instances wi WHERE wi.document_type = 'payment_requisition' AND wi.document_id = pr.id
			 )`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (!requisitions.length) return;

		const STATUS_MAP = { PENDING: 'in_progress', APPROVED: 'approved', REJECTED: 'rejected' };

		const rows = requisitions.map((req) => {
			const status = STATUS_MAP[req.status] || 'in_progress';
			return {
				org_id: req.org_id,
				document_type: 'payment_requisition',
				document_id: req.id,
				workflow_definition_id: definition.id,
				current_stage_id: status === 'in_progress' ? approverStage?.id ?? null : null,
				status,
				started_at: req.createdAt,
				completed_at: status === 'in_progress' ? null : req.updatedAt,
				restart_count: 0,
				createdAt: req.createdAt,
				updatedAt: req.updatedAt,
			};
		});

		await queryInterface.bulkInsert('workflow_instances', rows);
	},

	async down(queryInterface) {
		await queryInterface.sequelize.query(
			`DELETE FROM workflow_instances WHERE document_type = 'payment_requisition'`,
		);
	},
};
