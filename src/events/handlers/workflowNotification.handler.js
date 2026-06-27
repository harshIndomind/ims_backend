/**
 * Subscribes to the in-process `workflow.*` events emitted by `workflowEngine.service.js`
 * and creates in-app `Alert` rows for whoever is eligible to act on the document's new
 * current stage — decoupling "something happened in the workflow" from "who finds out about
 * it", so business logic never has to know about notifications and vice versa.
 *
 * Only `role` and `user` stage rules are resolved here. `department_role`/`store_role`/
 * `designation`/`dynamic_resolver` rules need the document's own context (department_id,
 * unit_id, etc.) that `workflow_instances` deliberately doesn't store (kept document-agnostic)
 * — resolving those would require the caller to pass `documentContext` through the event
 * payload, which isn't wired up yet. They're silently skipped for now rather than guessed at.
 *
 * Email is a one-line addition once a `workflow-stage-pending` Handlebars template exists
 * (see `src/utils/mailer.js`'s pattern) — not added speculatively here.
 */
const eventEmitter = require('../../utils/emitter');
const { Alert, WorkflowInstance, WorkflowStageRule, Role, User } = require('../../models/index');
const logger = require('../../utils/logger');

async function resolveEligibleUserIds(stageId) {
	const rules = await WorkflowStageRule.findAll({
		where: { workflow_stage_id: stageId },
		include: [{ model: Role }],
	});

	const userIds = new Set();
	for (const rule of rules) {
		if (rule.rule_type === 'user' && rule.user_id) {
			userIds.add(rule.user_id);
		} else if (rule.rule_type === 'role' && rule.Role) {
			const users = await User.findAll({
				include: [{ model: Role, as: 'userRoles', where: { id: rule.Role.id } }],
				attributes: ['id'],
			});
			users.forEach((u) => userIds.add(u.id));
		}
	}
	return [...userIds];
}

async function notifyOnWorkflowEvent({ documentType, documentId, instanceId, stagePending }) {
	try {
		if (stagePending) return; // current actor's own action, not a stage handoff yet

		const instance = await WorkflowInstance.findByPk(instanceId, {
			include: [{ association: 'currentStage' }],
		});
		if (!instance || !instance.current_stage_id) return; // terminal (approved/rejected/cancelled) — nothing to notify

		const userIds = await resolveEligibleUserIds(instance.current_stage_id);
		if (!userIds.length) return;

		const title = `${documentType.toUpperCase()} #${documentId} pending at ${instance.currentStage?.stage_name ?? 'next stage'}`;
		const description = `${documentType} #${documentId} is now pending your action at "${instance.currentStage?.stage_name}".`;

		await Alert.bulkCreate(
			userIds.map((user_id) => ({ user_id, title, description })),
		);
	} catch (err) {
		// Never let a notification failure affect the workflow transition that triggered it.
		logger.error('workflowNotification.handler failed', { documentType, documentId, err });
	}
}

function registerWorkflowNotificationHandler() {
	// The engine emits both the specific `workflow.<documentType>.<action>` event AND this
	// generic `workflow` event with the same payload — subscribing to the generic one means
	// this handler doesn't need to know every documentType/action combination up front.
	eventEmitter.on('workflow', notifyOnWorkflowEvent);
}

module.exports = { registerWorkflowNotificationHandler };
