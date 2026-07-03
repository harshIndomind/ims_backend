'use strict';

/**
 * Seeds the Work Order module's default workflow: Maker -> WO Approver.
 * Mirrors the PO workflow — single approval stage with the wo_approver role.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const now = new Date();

		const [existing] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_definitions WHERE document_type = 'work_order' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (existing) return;

		await queryInterface.bulkInsert('workflow_definitions', [
			{
				org_id: null,
				document_type: 'work_order',
				name: 'Work Order Default Workflow',
				description: 'Maker -> WO Approver',
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
			`SELECT id FROM workflow_definitions WHERE document_type = 'work_order' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		await queryInterface.bulkInsert('workflow_stages', [
			{
				workflow_definition_id: definition.id,
				sequence: 1,
				stage_key: 'wo_approver_l1',
				stage_name: 'WO Approver',
				stage_type: 'approval',
				is_required: true,
				is_terminal_approval: true,
				allow_edit_before: false,
				createdAt: now,
				updatedAt: now,
			},
		]);

		const [approverStage] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_stages WHERE workflow_definition_id = ${definition.id} AND stage_key = 'wo_approver_l1' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		const [approverRole] = await queryInterface.sequelize.query(
			`SELECT id FROM Roles WHERE code = 'wo_approver' LIMIT 1`,
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
			`SELECT id FROM workflow_definitions WHERE document_type = 'work_order' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
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
