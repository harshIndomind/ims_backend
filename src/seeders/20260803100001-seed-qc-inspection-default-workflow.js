'use strict';

/**
 * Seeds the QC Inspection module's default workflow: Inspector -> QC Approver.
 *
 * Single-stage, mirroring PO/WO's own default (see seed-purchase-order-default-workflow.js) —
 * the inspector's checklist/quantity work all happens BEFORE `POST /:id/submit` (via
 * assign/start/PUT items, the same pre-submission-editing shape Indent's and PO's own "maker"
 * step uses), so the inspector is not itself a workflow_stages row. The single post-submission
 * gate is a QC Approver sign-off on the inspector's already-recorded findings. Can be extended
 * to multi-stage later without any code change — just add rows to workflow_stages/
 * workflow_stage_rules.
 *
 * lock_stage_sequence = null: no edits allowed once submitted to the approver stage.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const now = new Date();

		const [existing] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_definitions WHERE document_type = 'qc_inspection' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (existing) return;

		await queryInterface.bulkInsert('workflow_definitions', [
			{
				org_id: null,
				document_type: 'qc_inspection',
				name: 'QC Inspection Default Workflow',
				description: 'Inspector -> QC Approver',
				is_active: true,
				is_default: true,
				version: 1,
				lock_stage_sequence: 1,
				restart_on_edit_after_rejection: true,
				createdAt: now,
				updatedAt: now,
			},
		]);

		const [definition] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_definitions WHERE document_type = 'qc_inspection' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		await queryInterface.bulkInsert('workflow_stages', [
			{
				workflow_definition_id: definition.id,
				sequence: 1,
				stage_key: 'qc_approver_l1',
				stage_name: 'QC Approver',
				stage_type: 'approval',
				is_required: true,
				is_terminal_approval: true,
				allow_edit_before: false,
				createdAt: now,
				updatedAt: now,
			},
		]);

		const [approverStage] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_stages WHERE workflow_definition_id = ${definition.id} AND stage_key = 'qc_approver_l1' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		const [approverRole] = await queryInterface.sequelize.query(`SELECT id FROM Roles WHERE code = 'qc_approver' LIMIT 1`, {
			type: Sequelize.QueryTypes.SELECT,
		});

		if (approverRole && approverStage) {
			await queryInterface.bulkInsert('workflow_stage_rules', [
				{
					workflow_stage_id: approverStage.id,
					rule_type: 'role',
					role_id: approverRole.id,
					match_mode: 'any',
					createdAt: now,
					updatedAt: now,
				},
			]);
		}
	},

	async down(queryInterface, Sequelize) {
		const [definition] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_definitions WHERE document_type = 'qc_inspection' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (!definition) return;

		await queryInterface.sequelize.query(
			`DELETE wsr FROM workflow_stage_rules wsr
			 JOIN workflow_stages ws ON wsr.workflow_stage_id = ws.id
			 WHERE ws.workflow_definition_id = ${definition.id}`,
		);
		await queryInterface.bulkDelete('workflow_stages', { workflow_definition_id: definition.id }, {});
		await queryInterface.bulkDelete('workflow_definitions', { id: definition.id }, {});
	},
};
