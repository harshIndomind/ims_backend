const { AuditLog } = require('../models/index');
const logger = require('../utils/logger');

function shallowDiff(before = {}, after = {}) {
	const diff = {};
	const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
	for (const key of keys) {
		const from = before?.[key];
		const to = after?.[key];
		if (JSON.stringify(from) !== JSON.stringify(to)) {
			diff[key] = { from, to };
		}
	}
	return diff;
}

function actorFromReq(req) {
	const user = req?.user;
	return user ? { id: user.id, name: user.name, email: user.email } : null;
}

function roleFromReq(req) {
	return req?.user?.role ?? req?.user?.roles?.[0] ?? null;
}

/**
 * Records one audit entry. When called with `transaction`, a write failure throws and
 * rolls back alongside the caller's business transaction (audit is part of the atomic
 * unit). When called without one, failures are logged and swallowed so an audit-logging
 * bug can never block a user-facing action.
 */
async function record({
	req,
	entityType,
	entityId,
	action,
	previousState = null,
	newState = null,
	remarks = null,
	workflowStageName = null,
	transaction = null,
}) {
	const payload = {
		org_id: req?.user?.org_id ?? null,
		entity_type: entityType,
		entity_id: entityId,
		action,
		performed_by: actorFromReq(req),
		performed_by_role: roleFromReq(req),
		previous_state: previousState,
		new_state: newState,
		changed_data: previousState || newState ? shallowDiff(previousState, newState) : null,
		remarks,
		ip_address: req?.ip ?? null,
		user_agent: req?.headers?.['user-agent'] ?? null,
		workflow_stage_name: workflowStageName,
	};

	if (transaction) {
		return AuditLog.create(payload, { transaction });
	}

	try {
		return await AuditLog.create(payload);
	} catch (err) {
		logger.error('Audit log write failed (non-transactional, swallowed)', {
			entityType,
			entityId,
			action,
			err,
		});
		return null;
	}
}

async function recordChange({ req, entityType, entityId, action, before, after, remarks, workflowStageName, transaction }) {
	return record({
		req,
		entityType,
		entityId,
		action,
		previousState: before,
		newState: after,
		remarks,
		workflowStageName,
		transaction,
	});
}

async function findByEntity(entityType, entityId, { limit, offset } = {}) {
	return AuditLog.findAndCountAll({
		where: { entity_type: entityType, entity_id: entityId },
		order: [['createdAt', 'DESC']],
		...(limit ? { limit: Number(limit), offset: Number(offset || 0) } : {}),
	});
}

module.exports = { record, recordChange, findByEntity };
