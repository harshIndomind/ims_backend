'use strict';

/**
 * One-time backfill: every Indent row that existed before the workflow engine shipped
 * needs a workflow_instances row, or list/view pages would show "no workflow data" for
 * historical records. isVerified=true rows are backfilled as already-approved; the rest
 * are backfilled as pending at the Verifier stage (matching the old single isVerified
 * flag, which only ever distinguished "verified+approved together" from "not yet").
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const [definition] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_definitions WHERE document_type = 'indent' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (!definition) return;

		const [verifierStage] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_stages WHERE workflow_definition_id = ${definition.id} AND stage_key = 'verifier_l1' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		const indents = await queryInterface.sequelize.query(
			`SELECT i.id, i.org_id, i.isVerified, i.createdAt, i.updatedAt FROM Indents i
			 WHERE NOT EXISTS (
			   SELECT 1 FROM workflow_instances wi WHERE wi.document_type = 'indent' AND wi.document_id = i.id
			 )`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (!indents.length) return;

		const rows = indents.map((indent) => ({
			org_id: indent.org_id,
			document_type: 'indent',
			document_id: indent.id,
			workflow_definition_id: definition.id,
			current_stage_id: indent.isVerified ? null : verifierStage?.id ?? null,
			status: indent.isVerified ? 'approved' : 'in_progress',
			started_at: indent.createdAt,
			completed_at: indent.isVerified ? indent.updatedAt : null,
			restart_count: 0,
			createdAt: indent.createdAt,
			updatedAt: indent.updatedAt,
		}));

		await queryInterface.bulkInsert('workflow_instances', rows);

		// Mirror the same backfilled state onto Indent's denormalized status column.
		await queryInterface.sequelize.query(
			`UPDATE Indents SET status = 'approved' WHERE isVerified = 1 AND status = 'draft'`,
		);
		await queryInterface.sequelize.query(
			`UPDATE Indents SET status = 'in_progress' WHERE isVerified = 0 AND status = 'draft'`,
		);
	},

	async down(queryInterface) {
		await queryInterface.sequelize.query(
			`DELETE FROM workflow_instances WHERE document_type = 'indent'`,
		);
	},
};
