'use strict';

const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const AppError = require('../utils/AppError');
const { WorkflowDefinition, WorkflowStage, WorkflowStageRule, Role, Designation, sequelize } = require('../models/index');
const workflowEngine = require('../services/workflowEngine.service');

function actorSnapshot(req) {
	const u = req.user;
	return u ? { id: u.id, name: u.name, email: u.email } : null;
}

// GET /workflow-definitions
exports.listDefinitions = catchAsync(async (req, res) => {
	const definitions = await WorkflowDefinition.findAll({
		include: [
			{
				model: WorkflowStage,
				as: 'stages',
				include: [{ model: WorkflowStageRule, as: 'rules' }],
				order: [['sequence', 'ASC']],
			},
		],
		order: [['document_type', 'ASC'], ['version', 'DESC']],
	});

	res.status(StatusCodes.OK).json({
		message: 'Workflow definitions fetched successfully',
		data: definitions,
	});
});

// GET /workflow-definitions/:id
exports.getDefinition = catchAsync(async (req, res) => {
	const { id } = req.params;
	const definition = await WorkflowDefinition.findByPk(id, {
		include: [
			{
				model: WorkflowStage,
				as: 'stages',
				include: [
					{
						model: WorkflowStageRule,
						as: 'rules',
						include: [
							{ model: Role, attributes: ['id', 'name', 'code'] },
							{ model: Designation, attributes: ['id', 'title'] },
						],
					},
				],
			},
		],
	});

	if (!definition) {
		throw new AppError('Workflow definition not found', StatusCodes.NOT_FOUND);
	}

	// Sort stages by sequence
	definition.stages?.sort((a, b) => a.sequence - b.sequence);

	res.status(StatusCodes.OK).json({
		message: 'Workflow definition fetched successfully',
		data: definition,
	});
});

// POST /workflow-definitions
// Body: { name, document_type, description, is_active, is_default, version, lock_stage_sequence,
//         restart_on_edit_after_rejection, stages: [{ stage_key, stage_name, stage_type, ... rules: [...] }] }
exports.createDefinition = catchAsync(async (req, res) => {
	const {
		name,
		document_type,
		description,
		is_active = true,
		is_default = false,
		version = 1,
		lock_stage_sequence = 1,
		restart_on_edit_after_rejection = true,
		stages = [],
	} = req.body;

	if (!name || !document_type) {
		throw new AppError('name and document_type are required', StatusCodes.BAD_REQUEST);
	}

	const transaction = await sequelize.transaction();
	try {
		const definition = await WorkflowDefinition.create(
			{
				name,
				document_type,
				description: description || null,
				is_active,
				is_default,
				version,
				lock_stage_sequence,
				restart_on_edit_after_rejection,
				createdBy: actorSnapshot(req),
			},
			{ transaction },
		);

		for (let i = 0; i < stages.length; i++) {
			const stageInput = stages[i];
			const stage = await WorkflowStage.create(
				{
					workflow_definition_id: definition.id,
					sequence: i + 1,
					stage_key: stageInput.stage_key,
					stage_name: stageInput.stage_name,
					stage_type: stageInput.stage_type,
					is_required: stageInput.is_required ?? true,
					is_terminal_approval: stageInput.is_terminal_approval ?? false,
					allow_edit_before: stageInput.allow_edit_before ?? true,
					sla_hours: stageInput.sla_hours ?? null,
					approval_strategy: stageInput.approval_strategy ?? 'single',
					min_approvals: stageInput.min_approvals ?? null,
					skip_condition_field: stageInput.skip_condition_field ?? null,
					skip_condition_operator: stageInput.skip_condition_operator ?? null,
					skip_condition_value: stageInput.skip_condition_value ?? null,
					skip_condition_value_to: stageInput.skip_condition_value_to ?? null,
				},
				{ transaction },
			);

			const rules = stageInput.rules || [];
			for (const ruleInput of rules) {
				await WorkflowStageRule.create(
					{
						workflow_stage_id: stage.id,
						rule_type: ruleInput.rule_type,
						role_id: ruleInput.role_id ?? null,
						user_id: ruleInput.user_id ?? null,
						designation_id: ruleInput.designation_id ?? null,
						resolver_key: ruleInput.resolver_key ?? null,
						condition_field: ruleInput.condition_field ?? null,
						condition_operator: ruleInput.condition_operator ?? null,
						condition_value: ruleInput.condition_value ?? null,
						condition_value_to: ruleInput.condition_value_to ?? null,
						match_mode: ruleInput.match_mode ?? 'any',
					},
					{ transaction },
				);
			}
		}

		await transaction.commit();

		const created = await WorkflowDefinition.findByPk(definition.id, {
			include: [{ model: WorkflowStage, as: 'stages', include: [{ model: WorkflowStageRule, as: 'rules' }] }],
		});

		res.status(StatusCodes.CREATED).json({
			message: 'Workflow definition created successfully',
			data: created,
		});
	} catch (err) {
		await transaction.rollback();
		throw err;
	}
});

// PUT /workflow-definitions/:id
// Creates a NEW version of the definition with the updated stages, then activates it.
// The original definition and its stages are NEVER deleted — in-flight workflow_instances
// pin `workflow_definition_id` at submission time and must continue resolving their
// `current_stage_id` against the original rows. Mutating or deleting those stages would
// leave `current_stage_id` pointing at a ghost row, making active documents appear stuck
// at "In Progress" with no stage name and a broken timeline.
exports.updateDefinition = catchAsync(async (req, res) => {
	const { id } = req.params;
	const {
		name,
		description,
		is_default,
		lock_stage_sequence,
		restart_on_edit_after_rejection,
		stages = [],
	} = req.body;

	const original = await WorkflowDefinition.findByPk(id);
	if (!original) throw new AppError('Workflow definition not found', StatusCodes.NOT_FOUND);

	const transaction = await sequelize.transaction();
	try {
		// Create a new version — document_type and org_id are immutable identifiers.
		const newDef = await WorkflowDefinition.create(
			{
				org_id: original.org_id,
				document_type: original.document_type,
				name: name ?? original.name,
				description: description !== undefined ? description : original.description,
				is_active: true,
				is_default: is_default !== undefined ? is_default : original.is_default,
				version: original.version + 1,
				lock_stage_sequence: lock_stage_sequence !== undefined ? lock_stage_sequence : original.lock_stage_sequence,
				restart_on_edit_after_rejection:
					restart_on_edit_after_rejection !== undefined
						? restart_on_edit_after_rejection
						: original.restart_on_edit_after_rejection,
				createdBy: actorSnapshot(req),
			},
			{ transaction },
		);

		for (let i = 0; i < stages.length; i++) {
			const stageInput = stages[i];
			const stage = await WorkflowStage.create(
				{
					workflow_definition_id: newDef.id,
					sequence: i + 1,
					stage_key: stageInput.stage_key,
					stage_name: stageInput.stage_name,
					stage_type: stageInput.stage_type,
					is_required: stageInput.is_required ?? true,
					is_terminal_approval: stageInput.is_terminal_approval ?? false,
					allow_edit_before: stageInput.allow_edit_before ?? true,
					sla_hours: stageInput.sla_hours ?? null,
					approval_strategy: stageInput.approval_strategy ?? 'single',
					min_approvals: stageInput.min_approvals ?? null,
					skip_condition_field: stageInput.skip_condition_field ?? null,
					skip_condition_operator: stageInput.skip_condition_operator ?? null,
					skip_condition_value: stageInput.skip_condition_value ?? null,
					skip_condition_value_to: stageInput.skip_condition_value_to ?? null,
				},
				{ transaction },
			);

			const rules = stageInput.rules || [];
			for (const ruleInput of rules) {
				await WorkflowStageRule.create(
					{
						workflow_stage_id: stage.id,
						rule_type: ruleInput.rule_type,
						role_id: ruleInput.role_id ?? null,
						user_id: ruleInput.user_id ?? null,
						designation_id: ruleInput.designation_id ?? null,
						resolver_key: ruleInput.resolver_key ?? null,
						condition_field: ruleInput.condition_field ?? null,
						condition_operator: ruleInput.condition_operator ?? null,
						condition_value: ruleInput.condition_value ?? null,
						condition_value_to: ruleInput.condition_value_to ?? null,
						match_mode: ruleInput.match_mode ?? 'any',
					},
					{ transaction },
				);
			}
		}

		// Deactivate old version(s) for this document_type + org_id, activate the new one.
		await workflowEngine.activateNewVersion(newDef.id, { transaction });

		await transaction.commit();

		const created = await WorkflowDefinition.findByPk(newDef.id, {
			include: [{ model: WorkflowStage, as: 'stages', include: [{ model: WorkflowStageRule, as: 'rules' }] }],
		});

		res.status(StatusCodes.OK).json({
			message: 'New workflow version published successfully',
			data: created,
		});
	} catch (err) {
		await transaction.rollback();
		throw err;
	}
});

// DELETE /workflow-definitions/:id
exports.deleteDefinition = catchAsync(async (req, res) => {
	const { id } = req.params;
	const definition = await WorkflowDefinition.findByPk(id);
	if (!definition) throw new AppError('Workflow definition not found', StatusCodes.NOT_FOUND);

	const transaction = await sequelize.transaction();
	try {
		const stages = await WorkflowStage.findAll({ where: { workflow_definition_id: id }, transaction });
		const stageIds = stages.map((s) => s.id);
		if (stageIds.length) {
			await WorkflowStageRule.destroy({ where: { workflow_stage_id: stageIds }, transaction });
		}
		await WorkflowStage.destroy({ where: { workflow_definition_id: id }, transaction });
		await definition.destroy({ transaction });
		await transaction.commit();
	} catch (err) {
		await transaction.rollback();
		throw err;
	}

	res.status(StatusCodes.OK).json({ message: 'Workflow definition deleted successfully' });
});

// POST /workflow-definitions/:id/activate
// Deactivates all other versions for the same (org_id, document_type) and activates this one.
exports.activateDefinition = catchAsync(async (req, res) => {
	const { id } = req.params;
	const transaction = await sequelize.transaction();
	try {
		const definition = await workflowEngine.activateNewVersion(id, { transaction });
		await transaction.commit();
		res.status(StatusCodes.OK).json({ message: 'Workflow definition activated successfully', data: definition });
	} catch (err) {
		await transaction.rollback();
		throw err;
	}
});
