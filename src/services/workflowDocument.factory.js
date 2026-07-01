/**
 * Generic factory for the workflow lifecycle actions that are genuinely uniform across every
 * ERP document type — reject, cancel, reopen, archive, restore, and reading workflow state.
 * `verify`/`approve` are deliberately NOT folded into this factory: every module's approval
 * step inherently carries its own domain logic (stock allocation for Indent, different
 * validation for PO/WO/GRN/etc.) — that's the entire point of having an approval stage, not
 * incidental duplication. Forcing them behind one opaque hook-based function here would either
 * (a) leak domain specifics back into "generic" code, or (b) become a hook system so large it
 * stops being simpler than just writing the function. Modules instead call `assertCanAct` and
 * `auditLogService` directly from their own verify/approve implementations (see
 * `indent.service.js`), which this factory also exposes for that reason.
 *
 * @param {object} options
 * @param {string} options.documentType - matches `workflow_instances.document_type`
 * @param {(id: number) => Promise<Model>} options.fetchById - loads the document with whatever
 *   includes the caller's verify/approve/view flows need
 * @param {string} [options.auditEntityType] - defaults to `documentType`
 * @param {(doc: Model) => object} [options.getDocumentContext] - fields (department_id,
 *   unit_id, etc.) used to evaluate department_role/store_role/skip-condition rules
 */
const { sequelize } = require('../models/index');
const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const workflowEngine = require('./workflowEngine.service');
const auditLogService = require('./auditLog.service');

function actorSnapshot(user) {
	return user ? { id: user.id, name: user.name, email: user.email } : null;
}

function createWorkflowDocumentService({
	documentType,
	fetchById,
	auditEntityType = documentType,
	getDocumentContext = () => ({}),
}) {
	async function fetchOrThrow(id) {
		const doc = await fetchById(id);
		if (!doc) {
			throw new AppError(`${documentType} with ID ${id} not found`, StatusCodes.NOT_FOUND);
		}
		return doc;
	}

	async function assertCanAct(req, doc) {
		const eligibility = await workflowEngine.canActOnCurrentStage({
			documentType,
			documentId: doc.id,
			actingUser: req.user,
			documentContext: getDocumentContext(doc),
		});
		if (!eligibility.allowed) {
			throw new AppError(eligibility.reason || `You are not eligible to act on this ${documentType}`, StatusCodes.FORBIDDEN);
		}
	}

	async function currentStageNameFor(id) {
		try {
			const { instance } = await workflowEngine.getInstanceWithStages({ documentType, documentId: id });
			return instance.currentStage?.stage_name ?? null;
		} catch {
			return null;
		}
	}

	/**
	 * @param {object} [hooks]
	 * @param {(doc: Model) => Promise<void>} [hooks.beforeReject] - e.g. a domain precondition check
	 */
	async function reject(req, id, remarks, hooks = {}) {
		if (!remarks || !remarks.trim()) {
			throw new AppError(`Remarks are required to reject a ${documentType}`, StatusCodes.BAD_REQUEST);
		}

		const doc = await fetchOrThrow(id);
		await assertCanAct(req, doc);
		if (hooks.beforeReject) await hooks.beforeReject(doc);

		const stageName = await currentStageNameFor(id);
		const transaction = await sequelize.transaction();
		try {
			await workflowEngine.rejectInstance({ req, documentType, documentId: id, remarks, transaction });

			if (hooks.withinTransaction) await hooks.withinTransaction(doc, transaction);

			await auditLogService.record({
				req,
				entityType: auditEntityType,
				entityId: id,
				action: 'rejected',
				remarks,
				workflowStageName: stageName,
				transaction,
			});
			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			throw error;
		}

		return fetchOrThrow(id);
	}

	/**
	 * @param {object} [hooks]
	 * @param {(doc: Model) => Promise<void>} [hooks.beforeCancel] - domain compensation (e.g.
	 *   VCP stock rollback), run BEFORE the transaction opens — exactly mirroring how
	 *   `cancelIndent` already calls `rollbackStockInProductService` ahead of its own
	 *   transaction, so this hook point preserves existing behavior rather than changing it.
	 * @param {(doc: Model, transaction: Transaction) => Promise<void>} [hooks.withinTransaction]
	 */
	async function cancel(req, id, remarks, hooks = {}) {
		if (!remarks || !remarks.trim()) {
			throw new AppError(`A cancellation reason is required`, StatusCodes.BAD_REQUEST);
		}

		const doc = await fetchOrThrow(id);
		if (hooks.beforeCancel) await hooks.beforeCancel(doc);

		const stageName = await currentStageNameFor(id);
		const transaction = await sequelize.transaction();
		try {
			await workflowEngine.cancelInstance({ req, documentType, documentId: id, remarks, transaction });

			if (hooks.withinTransaction) await hooks.withinTransaction(doc, transaction);

			await auditLogService.record({
				req,
				entityType: auditEntityType,
				entityId: id,
				action: 'cancelled',
				remarks,
				workflowStageName: stageName,
				transaction,
			});
			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			throw error;
		}

		return fetchOrThrow(id);
	}

	/**
	 * @param {object} [hooks]
	 * @param {(doc: Model, instance: Model, transaction: Transaction) => Promise<void>} [hooks.withinTransaction] -
	 *   for clearing module-specific denormalized columns (e.g. Indent's `rejected_by`/
	 *   `cancelled_by`) that mirror workflow_instances and would otherwise go stale once the
	 *   instance moves back to `in_progress`.
	 */
	async function reopen(req, id, remarks, hooks = {}) {
		const doc = await fetchOrThrow(id);

		const transaction = await sequelize.transaction();
		try {
			const instance = await workflowEngine.reopenInstance({ req, documentType, documentId: id, remarks, transaction });

			if (hooks.withinTransaction) await hooks.withinTransaction(doc, instance, transaction);

			await auditLogService.record({
				req,
				entityType: auditEntityType,
				entityId: id,
				action: 'reopened',
				remarks,
				newState: { status: instance.status },
				transaction,
			});
			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			throw error;
		}

		return fetchOrThrow(id);
	}

	async function archive(req, id, remarks) {
		await fetchOrThrow(id);

		const stageName = await currentStageNameFor(id);
		const transaction = await sequelize.transaction();
		try {
			await workflowEngine.archiveInstance({ req, documentType, documentId: id, remarks, transaction });
			await auditLogService.record({
				req,
				entityType: auditEntityType,
				entityId: id,
				action: 'archived',
				remarks,
				workflowStageName: stageName,
				transaction,
			});
			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			throw error;
		}

		return fetchOrThrow(id);
	}

	async function restore(req, id, remarks) {
		await fetchOrThrow(id);

		const stageName = await currentStageNameFor(id);
		const transaction = await sequelize.transaction();
		try {
			await workflowEngine.restoreInstance({ req, documentType, documentId: id, remarks, transaction });
			await auditLogService.record({
				req,
				entityType: auditEntityType,
				entityId: id,
				action: 'restored',
				remarks,
				workflowStageName: stageName,
				transaction,
			});
			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			throw error;
		}

		return fetchOrThrow(id);
	}

	async function getById(req, id) {
		return fetchOrThrow(id);
	}

	async function getWorkflow(req, id) {
		const timeline = await workflowEngine.getTimeline({ documentType, documentId: id });
		const history = await workflowEngine.getHistory({ documentType, documentId: id });
		const { instance } = await workflowEngine.getInstanceWithStages({ documentType, documentId: id });
		const currentStageName = instance.currentStage?.stage_name ?? null;

		return {
			timeline,
			history,
			currentStage: currentStageName,
			displayStatus: workflowEngine.computeDisplayStatus(instance.status, currentStageName),
			isEditable: await workflowEngine.isEditable({ documentType, documentId: id }),
			isArchived: instance.is_archived,
		};
	}

	return {
		fetchOrThrow,
		assertCanAct,
		actorSnapshot,
		reject,
		cancel,
		reopen,
		archive,
		restore,
		getById,
		getWorkflow,
	};
}

module.exports = { createWorkflowDocumentService };
