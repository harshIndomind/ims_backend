/**
 * Generic, document-agnostic workflow engine. Operates purely on
 * (document_type, document_id) — never imports a specific document model — so the same
 * engine can be wired up for other ERP documents later without any schema change.
 *
 * `lock_stage_sequence` on a workflow_definition is the LAST stage `sequence` at which the
 * document is still editable (inclusive). Once the current stage's sequence exceeds it,
 * `isEditable` returns false. A document sitting in `draft` (current_stage_id null, not yet
 * submitted) is always editable regardless of this value.
 */
const {
	WorkflowDefinition,
	WorkflowStage,
	WorkflowStageRule,
	WorkflowInstance,
	WorkflowAction,
	Role,
	User,
} = require('../models/index');
const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const logger = require('../utils/logger');
const eventEmitter = require('../utils/emitter');

function actorFromReq(req) {
	const user = req?.user;
	return user ? { id: user.id, name: user.name, email: user.email } : null;
}

function roleFromReq(req) {
	return req?.user?.role ?? req?.user?.roles?.[0] ?? null;
}

/**
 * Fires after the caller's transaction durably commits — never before, so a listener (e.g.
 * the notification handler) can never react to a workflow change that later rolled back.
 * Intra-service only (see `src/utils/emitter.js`) — NOT published to RabbitMQ, because that
 * bus's own consumer discards events whose `source` matches its own APP_CODE, which would
 * make every workflow event published by this same process unreachable by its own handlers.
 */
function emitWorkflowEvent(transaction, documentType, action, payload) {
	const fire = () => {
		eventEmitter.emit(`workflow.${documentType}.${action}`, payload);
		// Generic catch-all so listeners (e.g. the notification handler) don't need to know
		// every documentType/action combination up front — node:events has no wildcard support.
		eventEmitter.emit('workflow', { documentType, action, ...payload });
	};
	if (transaction) {
		transaction.afterCommit(fire);
	} else {
		fire();
	}
}

/**
 * Registry for `rule_type: 'dynamic_resolver'` — a documented extension point rather than a
 * full plugin system. Resolvers must be synchronous and side-effect free (no I/O), matching
 * every other branch of `canActOnCurrentStage`'s evaluation, which runs as a plain in-memory
 * map over already-fetched rule rows.
 */
const dynamicResolvers = new Map();

function registerDynamicResolver(key, resolverFn) {
	dynamicResolvers.set(key, resolverFn);
}

async function resolveDefinition(orgId, documentType) {
	const orgSpecific = await WorkflowDefinition.findOne({
		where: { org_id: orgId, document_type: documentType, is_active: true },
		include: [{ model: WorkflowStage, as: 'stages' }],
		order: [['version', 'DESC']],
	});
	if (orgSpecific) return orgSpecific;

	const globalDefault = await WorkflowDefinition.findOne({
		where: { org_id: null, document_type: documentType, is_active: true, is_default: true },
		include: [{ model: WorkflowStage, as: 'stages' }],
		order: [['version', 'DESC']],
	});
	if (!globalDefault) {
		throw new AppError(`No workflow definition configured for document type "${documentType}"`, StatusCodes.INTERNAL_SERVER_ERROR);
	}
	return globalDefault;
}

/**
 * Publishing a new version of a definition must never retroactively change documents already
 * in flight — those pin `workflow_definition_id` at creation and never re-resolve it. This
 * only controls which version NEW documents resolve to going forward.
 */
async function activateNewVersion(definitionId, { transaction } = {}) {
	const definition = await WorkflowDefinition.findByPk(definitionId, { transaction });
	if (!definition) throw new AppError('Workflow definition not found', StatusCodes.NOT_FOUND);

	await WorkflowDefinition.update(
		{ is_active: false },
		{
			where: { org_id: definition.org_id, document_type: definition.document_type, id: { [require('sequelize').Op.ne]: definition.id } },
			transaction,
		},
	);
	await definition.update({ is_active: true }, { transaction });
	return definition;
}

async function findInstance(documentType, documentId) {
	return WorkflowInstance.findOne({
		where: { document_type: documentType, document_id: documentId },
		include: [{ model: WorkflowStage, as: 'currentStage' }],
	});
}

async function getInstanceWithStages({ documentType, documentId }) {
	const instance = await findInstance(documentType, documentId);
	if (!instance) {
		throw new AppError(`No workflow instance found for ${documentType} #${documentId}`, StatusCodes.NOT_FOUND);
	}
	const definition = await WorkflowDefinition.findByPk(instance.workflow_definition_id, {
		include: [{ model: WorkflowStage, as: 'stages' }],
	});
	const stages = [...(definition?.stages || [])].sort((a, b) => a.sequence - b.sequence);
	const history = await WorkflowAction.findAll({
		where: { workflow_instance_id: instance.id },
		order: [['createdAt', 'ASC']],
	});
	return { instance, definition, stages, history };
}

// 'submitted'/'resubmitted'/'reopened' record `workflow_stage_id` as the stage the document is
// being QUEUED INTO, not a stage that was just acted on (see STAGE_COMPLETING_ACTIONS below,
// and startInstance/restartInstance/reopenInstance) — e.g. the Maker's "submitted" action is
// stamped with the Verifier stage's id because that's where the document is headed next, not
// because the Maker did anything at the Verifier stage. Displaying that id as "Stage" for these
// rows reads backwards (looks like the Creator acted at "Indent Verifier"), so they get the
// opposite treatment from every other action: stageName is the Created/maker step, and the
// stage they're queued into is shown as `nextStage` instead.
const QUEUE_ENTRY_ACTIONS = new Set(['submitted', 'resubmitted', 'reopened']);

/**
 * Decorates the raw `workflow_actions` ledger with display-only fields (stage name, previous/
 * next stage) computed from the stage list's `sequence` — never stored, always derived, so a
 * later stage reorder/edit to the definition can't leave stale text sitting in history rows.
 */
function decorateHistory(history, stages) {
	const orderedStages = [...stages].sort((a, b) => a.sequence - b.sequence);
	const indexById = new Map(orderedStages.map((s, i) => [s.id, i]));

	return history.map((row) => {
		const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
		const idx = plain.workflow_stage_id != null ? indexById.get(plain.workflow_stage_id) : undefined;
		const stage = idx != null ? orderedStages[idx] : null;

		if (QUEUE_ENTRY_ACTIONS.has(plain.action)) {
			return {
				...plain,
				stageName: 'Created',
				previousStage: null,
				nextStage: stage?.stage_name ?? null,
			};
		}

		const previousStage = idx == null ? null : idx === 0 ? 'Created' : orderedStages[idx - 1].stage_name;
		const nextStage = idx == null ? null : orderedStages[idx + 1]?.stage_name ?? null;

		return {
			...plain,
			stageName: stage?.stage_name ?? null,
			previousStage,
			nextStage,
		};
	});
}

async function getHistory({ documentType, documentId }) {
	const { history, stages } = await getInstanceWithStages({ documentType, documentId });
	return decorateHistory(history, stages);
}

/**
 * Creates the workflow_instances row for a brand-new document and immediately submits it
 * into the first stage (or straight to 'approved' if the resolved definition has zero
 * stages — "no verification/approval required"). Must be called inside the caller's own
 * transaction so a document row never exists without a corresponding workflow instance.
 */
async function startInstance({ req, documentType, documentId, orgId, transaction }) {
	const definition = await resolveDefinition(orgId, documentType);
	const stages = [...(definition.stages || [])].sort((a, b) => a.sequence - b.sequence);
	const firstStage = stages[0] ?? null;

	const instance = await WorkflowInstance.create(
		{
			org_id: orgId,
			document_type: documentType,
			document_id: documentId,
			workflow_definition_id: definition.id,
			current_stage_id: firstStage?.id ?? null,
			status: firstStage ? 'in_progress' : 'approved',
			started_at: new Date(),
			completed_at: firstStage ? null : new Date(),
		},
		{ transaction },
	);

	await WorkflowAction.create(
		{
			workflow_instance_id: instance.id,
			workflow_stage_id: firstStage?.id ?? null,
			action: 'submitted',
			performed_by: actorFromReq(req),
			performed_by_role: roleFromReq(req),
		},
		{ transaction },
	);

	emitWorkflowEvent(transaction, documentType, 'submitted', { documentType, documentId, instanceId: instance.id });

	return instance;
}

function evaluateCondition(rule, documentContext) {
	if (!rule.condition_field) return true;
	const actual = Number(documentContext?.[rule.condition_field]);
	const value = Number(rule.condition_value);
	switch (rule.condition_operator) {
		case 'gte':
			return actual >= value;
		case 'lte':
			return actual <= value;
		case 'eq':
			return actual === value;
		case 'between':
			return actual >= value && actual <= Number(rule.condition_value_to);
		default:
			return true;
	}
}

/** Same shape as `evaluateCondition`, applied to a stage's own `skip_condition_*` columns
 * instead of a stage-rule row's `condition_*` columns. */
function shouldSkipStage(stage, documentContext) {
	if (!stage.is_required) return true;
	if (!stage.skip_condition_field) return false;
	return evaluateCondition(
		{
			condition_field: stage.skip_condition_field,
			condition_operator: stage.skip_condition_operator,
			condition_value: stage.skip_condition_value,
			condition_value_to: stage.skip_condition_value_to,
		},
		documentContext,
	);
}

/**
 * Can `actingUser` act on the document's current stage right now? Evaluates every
 * workflow_stage_rules row for that stage against the user's roles (and, for
 * department/store/designation-scoped rules, the user's own profile vs the document's).
 */
async function canActOnCurrentStage({ documentType, documentId, actingUser, documentContext = {} }) {
	if (actingUser?.roles?.includes('super_admin')) return { allowed: true };

	const instance = await findInstance(documentType, documentId);
	if (!instance || !instance.current_stage_id) {
		return { allowed: false, reason: 'Document is not currently pending at any workflow stage' };
	}

	const rules = await WorkflowStageRule.findAll({
		where: { workflow_stage_id: instance.current_stage_id },
		include: [{ model: Role }],
	});
	if (!rules.length) {
		return { allowed: false, reason: 'No one is configured to act on this stage' };
	}

	let actingUserRecord = null;
	const needsScopeLookup = rules.some((r) =>
		['department_role', 'store_role', 'designation'].includes(r.rule_type),
	);
	if (needsScopeLookup) {
		actingUserRecord = await User.findByPk(actingUser.id, {
			attributes: ['id', 'department_id', 'unit_id', 'designation_id'],
		});
	}

	const results = rules.map((rule) => {
		if (!evaluateCondition(rule, documentContext)) return false;
		switch (rule.rule_type) {
			case 'role':
				return Boolean(rule.Role?.code) && (actingUser.roles || []).includes(rule.Role.code);
			case 'user':
				return rule.user_id === actingUser.id;
			case 'department_role':
				return (
					Boolean(rule.Role?.code) &&
					(actingUser.roles || []).includes(rule.Role.code) &&
					actingUserRecord?.department_id != null &&
					actingUserRecord.department_id === documentContext.department_id
				);
			case 'store_role':
				return (
					Boolean(rule.Role?.code) &&
					(actingUser.roles || []).includes(rule.Role.code) &&
					actingUserRecord?.unit_id != null &&
					actingUserRecord.unit_id === documentContext.unit_id
				);
			case 'designation':
				return (
					rule.designation_id != null &&
					actingUserRecord?.designation_id != null &&
					actingUserRecord.designation_id === rule.designation_id
				);
			case 'organization':
				// Already satisfied at definition-resolution time — a definition is only ever
				// resolved for the acting user's own org_id, so reaching this point already
				// implies an organization match.
				return true;
			case 'dynamic_resolver': {
				const resolver = dynamicResolvers.get(rule.resolver_key);
				if (!resolver) {
					throw new AppError(
						`No dynamic_resolver registered for key "${rule.resolver_key}"`,
						StatusCodes.INTERNAL_SERVER_ERROR,
					);
				}
				return Boolean(resolver(actingUser, documentContext));
			}
			case 'reporting_manager':
			case 'group':
				throw new AppError(
					`Workflow rule_type "${rule.rule_type}" is not supported yet`,
					StatusCodes.NOT_IMPLEMENTED,
				);
			default:
				return false;
		}
	});

	const matchMode = rules[0]?.match_mode || 'any';
	const allowed = matchMode === 'all' ? results.every(Boolean) : results.some(Boolean);

	return allowed ? { allowed: true } : { allowed: false, reason: 'You are not eligible to act on this document at its current stage' };
}

/**
 * Returns the closed set of distinct eligible actor ids for an `all_required` stage. Only
 * `user`-type rules qualify — "all current holders of a broad role" is an open, ambiguous set
 * that can grow/shrink independently of the document, so it's deliberately not supported here.
 */
async function getRequiredActorIds(stage) {
	const rules = await WorkflowStageRule.findAll({ where: { workflow_stage_id: stage.id } });
	const nonUserRules = rules.filter((r) => r.rule_type !== 'user');
	if (nonUserRules.length > 0) {
		throw new AppError(
			`Stage "${stage.stage_name}" uses approval_strategy "${stage.approval_strategy}", which requires a closed set of actors — only rule_type "user" rows are supported for this strategy`,
			StatusCodes.INTERNAL_SERVER_ERROR,
		);
	}
	return [...new Set(rules.map((r) => r.user_id))];
}

/** Has this stage's completion condition been met by the actions recorded so far? `single`
 * and `any_one` both complete on the first qualifying action — the difference between them is
 * purely how many actors COULD have acted (data, not control flow). */
async function isStageComplete(stage, instance, action, transaction) {
	switch (stage.approval_strategy) {
		case 'all_required': {
			const requiredActorIds = await getRequiredActorIds(stage);
			const actions = await WorkflowAction.findAll({
				where: { workflow_instance_id: instance.id, workflow_stage_id: stage.id, action },
				transaction,
			});
			const actedIds = new Set(actions.map((a) => a.performed_by?.id).filter((id) => id != null));
			return requiredActorIds.every((id) => actedIds.has(id));
		}
		case 'min_count': {
			const actions = await WorkflowAction.findAll({
				where: { workflow_instance_id: instance.id, workflow_stage_id: stage.id, action },
				transaction,
			});
			const actedIds = new Set(actions.map((a) => a.performed_by?.id).filter((id) => id != null));
			return actedIds.size >= (stage.min_approvals || 1);
		}
		case 'single':
		case 'any_one':
		default:
			return true;
	}
}

/**
 * Records one actor's action against the current stage, then — only once the stage's
 * approval_strategy condition is satisfied — advances past it, skipping any subsequent stage
 * that's not required or whose skip_condition matches. Must run inside the caller's
 * transaction alongside the document's own persistence.
 */
async function advanceStage({ req, documentType, documentId, action, remarks = null, transaction, documentContext = {} }) {
	const instance = await WorkflowInstance.findOne({
		where: { document_type: documentType, document_id: documentId },
		transaction,
	});
	if (!instance) throw new AppError('Workflow instance not found', StatusCodes.NOT_FOUND);
	if (instance.status !== 'in_progress') {
		throw new AppError(`Cannot act on a workflow instance with status "${instance.status}"`, StatusCodes.BAD_REQUEST);
	}

	const completedStage = await WorkflowStage.findByPk(instance.current_stage_id, { transaction });

	await WorkflowAction.create(
		{
			workflow_instance_id: instance.id,
			workflow_stage_id: completedStage?.id ?? null,
			action,
			performed_by: actorFromReq(req),
			performed_by_role: roleFromReq(req),
			remarks,
		},
		{ transaction },
	);

	const stageComplete = completedStage
		? await isStageComplete(completedStage, instance, action, transaction)
		: true;

	if (!stageComplete) {
		// Stage still waiting on other required/min-count actors — do not transition yet.
		emitWorkflowEvent(transaction, documentType, action, { documentType, documentId, instanceId: instance.id, stagePending: true });
		return instance;
	}

	const remainingStages = await WorkflowStage.findAll({
		where: { workflow_definition_id: instance.workflow_definition_id },
		order: [['sequence', 'ASC']],
		transaction,
	});

	let nextStage = null;
	for (const stage of remainingStages) {
		if (stage.sequence <= (completedStage?.sequence ?? 0)) continue;
		if (shouldSkipStage(stage, documentContext)) {
			await WorkflowAction.create(
				{
					workflow_instance_id: instance.id,
					workflow_stage_id: stage.id,
					action: 'skipped',
					performed_by: actorFromReq(req),
					performed_by_role: roleFromReq(req),
				},
				{ transaction },
			);
			continue;
		}
		nextStage = stage;
		break;
	}

	if (nextStage) {
		await instance.update({ current_stage_id: nextStage.id }, { transaction });
	} else {
		// No more stages — terminal. Mark approved regardless of which stage's
		// is_terminal_approval fired, since reaching the end of the chain IS approval.
		await instance.update(
			{ current_stage_id: null, status: 'approved', completed_at: new Date() },
			{ transaction },
		);
	}

	emitWorkflowEvent(transaction, documentType, action, { documentType, documentId, instanceId: instance.id, stagePending: false });

	return instance;
}

/** Only mutates workflow tables — any compensating domain action (e.g. stock rollback) is
 * the caller's responsibility, done BEFORE calling this. */
async function rejectInstance({ req, documentType, documentId, remarks, transaction }) {
	const instance = await WorkflowInstance.findOne({
		where: { document_type: documentType, document_id: documentId },
		transaction,
	});
	if (!instance) throw new AppError('Workflow instance not found', StatusCodes.NOT_FOUND);

	await WorkflowAction.create(
		{
			workflow_instance_id: instance.id,
			workflow_stage_id: instance.current_stage_id,
			action: 'rejected',
			performed_by: actorFromReq(req),
			performed_by_role: roleFromReq(req),
			remarks,
		},
		{ transaction },
	);

	await instance.update(
		{ current_stage_id: null, status: 'rejected', completed_at: new Date() },
		{ transaction },
	);

	emitWorkflowEvent(transaction, documentType, 'rejected', { documentType, documentId, instanceId: instance.id });

	return instance;
}

/** Same non-domain-mutating contract as rejectInstance. */
async function cancelInstance({ req, documentType, documentId, remarks, transaction }) {
	const instance = await WorkflowInstance.findOne({
		where: { document_type: documentType, document_id: documentId },
		transaction,
	});
	if (!instance) throw new AppError('Workflow instance not found', StatusCodes.NOT_FOUND);

	await WorkflowAction.create(
		{
			workflow_instance_id: instance.id,
			workflow_stage_id: instance.current_stage_id,
			action: 'cancelled',
			performed_by: actorFromReq(req),
			performed_by_role: roleFromReq(req),
			remarks,
		},
		{ transaction },
	);

	await instance.update(
		{ current_stage_id: null, status: 'cancelled', completed_at: new Date() },
		{ transaction },
	);

	emitWorkflowEvent(transaction, documentType, 'cancelled', { documentType, documentId, instanceId: instance.id });

	return instance;
}

async function restartInstance({ req, documentType, documentId, remarks = null, transaction }) {
	const instance = await WorkflowInstance.findOne({
		where: { document_type: documentType, document_id: documentId },
		transaction,
	});
	if (!instance) throw new AppError('Workflow instance not found', StatusCodes.NOT_FOUND);

	const firstStage = await WorkflowStage.findOne({
		where: { workflow_definition_id: instance.workflow_definition_id },
		order: [['sequence', 'ASC']],
		transaction,
	});

	await instance.update(
		{
			current_stage_id: firstStage?.id ?? null,
			status: firstStage ? 'in_progress' : 'approved',
			completed_at: null,
			restart_count: instance.restart_count + 1,
		},
		{ transaction },
	);

	await WorkflowAction.create(
		{
			workflow_instance_id: instance.id,
			workflow_stage_id: firstStage?.id ?? null,
			action: 'resubmitted',
			performed_by: actorFromReq(req),
			performed_by_role: roleFromReq(req),
			remarks,
		},
		{ transaction },
	);

	emitWorkflowEvent(transaction, documentType, 'resubmitted', { documentType, documentId, instanceId: instance.id });

	return instance;
}

/**
 * Explicit user-initiated reopen of a Rejected or Cancelled document — distinct from
 * `restartInstance`, which is invoked implicitly as a side effect of editing a rejected
 * document. Logs `reopened` (not `resubmitted`) so the two paths stay distinguishable in the
 * audit/history ledger.
 */
async function reopenInstance({ req, documentType, documentId, remarks = null, transaction }) {
	const instance = await WorkflowInstance.findOne({
		where: { document_type: documentType, document_id: documentId },
		transaction,
	});
	if (!instance) throw new AppError('Workflow instance not found', StatusCodes.NOT_FOUND);
	if (!['rejected', 'cancelled'].includes(instance.status)) {
		throw new AppError(`Cannot reopen a workflow instance with status "${instance.status}"`, StatusCodes.BAD_REQUEST);
	}

	const firstStage = await WorkflowStage.findOne({
		where: { workflow_definition_id: instance.workflow_definition_id },
		order: [['sequence', 'ASC']],
		transaction,
	});

	await instance.update(
		{
			current_stage_id: firstStage?.id ?? null,
			status: firstStage ? 'in_progress' : 'approved',
			completed_at: null,
			restart_count: instance.restart_count + 1,
		},
		{ transaction },
	);

	await WorkflowAction.create(
		{
			workflow_instance_id: instance.id,
			workflow_stage_id: firstStage?.id ?? null,
			action: 'reopened',
			performed_by: actorFromReq(req),
			performed_by_role: roleFromReq(req),
			remarks,
		},
		{ transaction },
	);

	emitWorkflowEvent(transaction, documentType, 'reopened', { documentType, documentId, instanceId: instance.id });

	return instance;
}

/**
 * Archive/Restore are a visibility/lifecycle concern orthogonal to any specific business
 * action (Cancel, Reject, Delete) — they live once on the generic `workflow_instances` table
 * rather than being re-added to every future module's document table.
 */
async function archiveInstance({ req, documentType, documentId, remarks = null, transaction }) {
	const instance = await WorkflowInstance.findOne({
		where: { document_type: documentType, document_id: documentId },
		transaction,
	});
	if (!instance) throw new AppError('Workflow instance not found', StatusCodes.NOT_FOUND);
	if (instance.is_archived) {
		throw new AppError('This document is already archived', StatusCodes.BAD_REQUEST);
	}

	await instance.update(
		{ is_archived: true, archived_at: new Date(), archived_by: actorFromReq(req) },
		{ transaction },
	);

	await WorkflowAction.create(
		{
			workflow_instance_id: instance.id,
			workflow_stage_id: instance.current_stage_id,
			action: 'archived',
			performed_by: actorFromReq(req),
			performed_by_role: roleFromReq(req),
			remarks,
		},
		{ transaction },
	);

	emitWorkflowEvent(transaction, documentType, 'archived', { documentType, documentId, instanceId: instance.id });

	return instance;
}

async function restoreInstance({ req, documentType, documentId, remarks = null, transaction }) {
	const instance = await WorkflowInstance.findOne({
		where: { document_type: documentType, document_id: documentId },
		transaction,
	});
	if (!instance) throw new AppError('Workflow instance not found', StatusCodes.NOT_FOUND);
	if (!instance.is_archived) {
		throw new AppError('This document is not archived', StatusCodes.BAD_REQUEST);
	}

	await instance.update({ is_archived: false, archived_at: null, archived_by: null }, { transaction });

	await WorkflowAction.create(
		{
			workflow_instance_id: instance.id,
			workflow_stage_id: instance.current_stage_id,
			action: 'restored',
			performed_by: actorFromReq(req),
			performed_by_role: roleFromReq(req),
			remarks,
		},
		{ transaction },
	);

	emitWorkflowEvent(transaction, documentType, 'restored', { documentType, documentId, instanceId: instance.id });

	return instance;
}

function computeDisplayStatus(status, currentStageName) {
	switch (status) {
		case 'draft':
			return 'Draft';
		case 'in_progress':
			return currentStageName ? `Pending at ${currentStageName}` : 'In Progress';
		case 'approved':
			return 'Approved';
		case 'rejected':
			return 'Rejected';
		case 'cancelled':
			return 'Cancelled';
		default:
			return status;
	}
}

async function isEditable({ documentType, documentId }) {
	const instance = await findInstance(documentType, documentId);
	if (!instance) return true; // no instance yet — nothing to lock
	if (instance.status === 'draft') return true;
	// Rejected documents are always editable — fixing the issue and resubmitting is the
	// entire point of rejection (the caller restarts the workflow on save, see
	// updateIndent's restart_on_edit_after_rejection handling).
	if (instance.status === 'rejected') return true;
	if (instance.status !== 'in_progress') return false; // approved/cancelled are locked

	const definition = await WorkflowDefinition.findByPk(instance.workflow_definition_id);
	const currentStage = instance.currentStage ?? (await WorkflowStage.findByPk(instance.current_stage_id));
	if (!currentStage) return false;

	return currentStage.sequence <= (definition?.lock_stage_sequence ?? 1);
}

// Actions that mark a stage as DONE (in some terminal sense) on the timeline. 'submitted'
// and 'resubmitted' only mean "entered the queue for this stage" — they must never be
// mistaken for the stage itself having been acted on.
const STAGE_COMPLETING_ACTIONS = new Set(['verified', 'approved', 'rejected', 'skipped', 'cancelled']);

async function getTimeline({ documentType, documentId }) {
	const { instance, stages, history } = await getInstanceWithStages({ documentType, documentId });

	const actionByStageId = new Map();
	let submittedAction = null;
	for (const action of history) {
		if (action.action === 'submitted') submittedAction = action;
		if (action.workflow_stage_id && STAGE_COMPLETING_ACTIONS.has(action.action)) {
			actionByStageId.set(action.workflow_stage_id, action);
		}
	}

	const createdNode = {
		stageKey: '__created__',
		stageName: 'Created',
		stageType: 'maker',
		status: 'completed',
		performedBy: submittedAction?.performed_by ?? null,
		performedByRole: submittedAction?.performed_by_role ?? null,
		performedAt: submittedAction?.createdAt ?? instance.createdAt,
		remarks: null,
	};

	const stageNodes = stages.map((stage) => {
		const stageAction = actionByStageId.get(stage.id);
		let status = 'pending';
		if (stageAction) {
			if (stageAction.action === 'rejected') status = 'rejected';
			else if (stageAction.action === 'skipped') status = 'skipped';
			else status = 'completed';
		} else if (instance.status === 'cancelled') {
			status = 'cancelled';
		} else if (instance.current_stage_id === stage.id) {
			status = 'active';
		}

		return {
			stageKey: stage.stage_key,
			stageName: stage.stage_name,
			stageType: stage.stage_type,
			status,
			performedBy: stageAction?.performed_by ?? null,
			performedByRole: stageAction?.performed_by_role ?? null,
			performedAt: stageAction?.createdAt ?? null,
			remarks: stageAction?.remarks ?? null,
		};
	});

	return [createdNode, ...stageNodes];
}

module.exports = {
	resolveDefinition,
	activateNewVersion,
	findInstance,
	startInstance,
	getInstanceWithStages,
	getHistory,
	canActOnCurrentStage,
	advanceStage,
	rejectInstance,
	cancelInstance,
	restartInstance,
	reopenInstance,
	archiveInstance,
	restoreInstance,
	computeDisplayStatus,
	isEditable,
	getTimeline,
	registerDynamicResolver,
};
