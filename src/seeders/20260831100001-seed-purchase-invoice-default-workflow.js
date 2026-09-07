'use strict';

/**
 * Seeds the Purchase Invoice module's default workflow: Requester -> Purchase
 * Invoice Approver.
 *
 * Single-stage, mirroring Short Close's own default (see
 * seed-short-close-default-workflow.js) — the requester fills the whole
 * invoice (PO, vendor invoice details, lines with qty/price) before calling
 * POST /purchase-invoices, which immediately starts the workflow instance.
 * The single post-creation gate is a Purchase Invoice Approver sign-off,
 * where price/tax variance flags (if any) get their required review.
 *
 * lock_stage_sequence = 1: no edits allowed once submitted to the approver
 * stage — a rejected/cancelled invoice is not resubmitted in place, a new one
 * is raised instead (append-only, same as Short Close / QC Inspection).
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const now = new Date();

		const [existing] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_definitions WHERE document_type = 'purchase_invoice' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		if (existing) return;

		await queryInterface.bulkInsert('workflow_definitions', [
			{
				org_id: null,
				document_type: 'purchase_invoice',
				name: 'Purchase Invoice Default Workflow',
				description: 'Requester -> Purchase Invoice Approver',
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
			`SELECT id FROM workflow_definitions WHERE document_type = 'purchase_invoice' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		await queryInterface.bulkInsert('workflow_stages', [
			{
				workflow_definition_id: definition.id,
				sequence: 1,
				stage_key: 'purchase_invoice_approver_l1',
				stage_name: 'Purchase Invoice Approver',
				stage_type: 'approval',
				is_required: true,
				is_terminal_approval: true,
				allow_edit_before: false,
				createdAt: now,
				updatedAt: now,
			},
		]);

		const [approverStage] = await queryInterface.sequelize.query(
			`SELECT id FROM workflow_stages WHERE workflow_definition_id = ${definition.id} AND stage_key = 'purchase_invoice_approver_l1' LIMIT 1`,
			{ type: Sequelize.QueryTypes.SELECT },
		);

		const [approverRole] = await queryInterface.sequelize.query(
			`SELECT id FROM Roles WHERE code = 'purchase_invoice_approver' LIMIT 1`,
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
			`SELECT id FROM workflow_definitions WHERE document_type = 'purchase_invoice' AND org_id IS NULL AND is_default = 1 LIMIT 1`,
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
