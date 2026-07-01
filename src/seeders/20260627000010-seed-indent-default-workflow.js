'use strict';

/**
 * Seeds the Indent module's default workflow as DATA: Maker -> Indent Verifier ->
 * Indent Approver. Changing this chain later (adding stages, swapping roles, requiring
 * multiple verifiers, etc.) is a matter of editing these rows — no code change needed.
 *
 * lock_stage_sequence = 1: the indent stays editable while sitting at the Verifier stage
 * (sequence 1) and locks as soon as it advances to the Approver stage (sequence 2) — i.e.
 * editable for the entire "awaiting verification" window, locked once verification is done.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const now = new Date();

		const [existing] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_definitions WHERE document_type = 'indent' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (existing) return; // already seeded

		await queryInterface.bulkInsert('workflow_definitions', [
			{
				org_id: null,
				document_type: 'indent',
				name: 'Indent Default Workflow',
				description: 'Maker -> Indent Verifier -> Indent Approver',
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
			`SELECT id FROM workflow_definitions WHERE document_type = 'indent' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		await queryInterface.bulkInsert('workflow_stages', [
			{
				workflow_definition_id: definition.id,
				sequence: 1,
				stage_key: 'verifier_l1',
				stage_name: 'Indent Verifier',
				stage_type: 'verification',
				is_required: true,
				is_terminal_approval: false,
				allow_edit_before: true,
				createdAt: now,
				updatedAt: now,
			},
			{
				workflow_definition_id: definition.id,
				sequence: 2,
				stage_key: 'approver_l1',
				stage_name: 'Indent Approver',
				stage_type: 'approval',
				is_required: true,
				is_terminal_approval: true,
				allow_edit_before: false,
				createdAt: now,
				updatedAt: now,
			},
		]);

		const stages = await queryInterface.sequelize.query(
			`SELECT id, stage_key FROM workflow_stages WHERE workflow_definition_id = ${definition.id}`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		const verifierStage = stages.find((s) => s.stage_key === 'verifier_l1');
		const approverStage = stages.find((s) => s.stage_key === 'approver_l1');

		const roles = await queryInterface.sequelize.query(
			`SELECT id, code FROM Roles WHERE code IN ('indent_verifier', 'indent_approver')`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		const verifierRole = roles.find((r) => r.code === 'indent_verifier');
		const approverRole = roles.find((r) => r.code === 'indent_approver');

		const ruleRows = [];
		if (verifierRole) {
			ruleRows.push({
				workflow_stage_id: verifierStage.id,
				rule_type: 'role',
				role_id: verifierRole.id,
				match_mode: 'any',
				createdAt: now,
				updatedAt: now,
			});
		}
		if (approverRole) {
			ruleRows.push({
				workflow_stage_id: approverStage.id,
				rule_type: 'role',
				role_id: approverRole.id,
				match_mode: 'any',
				createdAt: now,
				updatedAt: now,
			});
		}
		if (ruleRows.length) {
			await queryInterface.bulkInsert('workflow_stage_rules', ruleRows);
		}
	},

	async down(queryInterface, Sequelize) {
		const [definition] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_definitions WHERE document_type = 'indent' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
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
