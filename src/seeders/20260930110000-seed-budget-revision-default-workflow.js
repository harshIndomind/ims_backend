'use strict';

/**
 * Seeds the Budget Revision module's default workflow: Requester -> Budget Approver.
 *
 * Single-stage, same shape as Short Close's default (seed-short-close-default-workflow.js) —
 * the requester fills the whole request (budget, amount, reason) and POST /budget-revisions
 * immediately starts the workflow instance. Reuses the pre-existing `budget_approver` role
 * (RoleSeeder) rather than inserting a new one. Orgs wanting a multi-stage chain (e.g. Finance
 * then Management) publish their own org-specific definition in the Workflow master — the
 * revision service only ever resolves through workflowEngine, never hardcodes stages.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const now = new Date();

		const [existing] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_definitions WHERE document_type = 'budget_revision' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (existing) return;

		await queryInterface.bulkInsert('workflow_definitions', [
			{
				org_id: null,
				document_type: 'budget_revision',
				name: 'Budget Revision Default Workflow',
				description: 'Requester -> Budget Approver',
				is_active: true,
				is_default: true,
				version: 1,
				lock_stage_sequence: 1,
				restart_on_edit_after_rejection: false,
				createdAt: now,
				updatedAt: now,
			},
		]);

		const [definition] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_definitions WHERE document_type = 'budget_revision' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		await queryInterface.bulkInsert('workflow_stages', [
			{
				workflow_definition_id: definition.id,
				sequence: 1,
				stage_key: 'budget_revision_approver_l1',
				stage_name: 'Budget Approver',
				stage_type: 'approval',
				is_required: true,
				is_terminal_approval: true,
				allow_edit_before: false,
				createdAt: now,
				updatedAt: now,
			},
		]);

		const [approverStage] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_stages WHERE workflow_definition_id = ${definition.id} AND stage_key = 'budget_revision_approver_l1' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		const [approverRole] = await queryInterface.sequelize.query(
			`SELECT id FROM Roles WHERE code = 'budget_approver' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

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
			`SELECT id FROM workflow_definitions WHERE document_type = 'budget_revision' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
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
