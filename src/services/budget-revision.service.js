/**
 * Budget Revision — the controlled path for raising a budget's commitment limit when a PO/WO's
 * budget impact exceeds it (docs/budget-validation/budget-modification.md "PO/WO Exceeds Budget").
 * The budget is never increased silently: a revision is a workflow document (document_type
 * 'budget_revision', default single-stage Budget Approver — see
 * seed-budget-revision-default-workflow.js), and only its FINAL approval moves
 * Budget.revised_amount, under a Budget row lock, re-checking the cost-centre allocation.
 */
const { Op } = require('sequelize');
const { StatusCodes } = require('http-status-codes');
const AppError = require('../utils/AppError');
const { sequelize, Budget, BudgetRevision, MasterSubHeadCostCenterAmount } = require('../models/index');
const workflowEngine = require('./workflowEngine.service');
const auditLogService = require('./auditLog.service');
const dataVisibility = require('./dataVisibility.service');
const { createWorkflowDocumentService } = require('./workflowDocument.factory');
const { effectiveCommitmentLimit, allocationUsage } = require('../utils/budget-limit.util');
const { round2 } = require('../utils/money');

const DOCUMENT_TYPE = 'budget_revision';
const OPEN_STATUSES = ['draft', 'in_progress'];

function actorSnapshot(user) {
	return user ? { id: user.id, name: user.name, email: user.email } : null;
}

async function fetchRevisionOrThrow(id, options = {}) {
	const revision = await BudgetRevision.findOne({
		where: { id },
		include: [
			{
				model: Budget,
				as: 'budget',
				attributes: [
					'id', 'budget_id', 'budgetType', 'unit_id', 'department_id', 'amount', 'tax_duty_amount',
					'provision_amount', 'commitment_limit', 'revised_amount', 'stnname',
				],
			},
		],
		...options,
	});
	if (!revision) {
		throw new AppError(`Budget Revision with ID ${id} not found`, StatusCodes.NOT_FOUND);
	}
	return revision;
}

// department_id/unit_id feed department_role/store_role stage rules; revision_amount lets an
// org configure amount-threshold stages (e.g. skip Management below 1L) via stage conditions.
const getDocumentContext = (revision) => ({
	department_id: revision.budget?.department_id,
	unit_id: revision.budget?.unit_id,
	revision_amount: Number(revision.revision_amount),
});

const revisionWorkflow = createWorkflowDocumentService({
	documentType: DOCUMENT_TYPE,
	fetchById: (id) => fetchRevisionOrThrow(id),
	getDocumentContext,
});

/** The revision must still fit inside the budget's cost-centre allocation (new money isn't free). */
async function assertAllocationHeadroom(budget, revisionAmount, transaction) {
	if (!budget.sub_head_cost_center_amount_id) return;
	const allocation = await MasterSubHeadCostCenterAmount.findByPk(budget.sub_head_cost_center_amount_id, { transaction });
	if (!allocation) return;
	const budgets = await Budget.findAll({
		where: { sub_head_cost_center_amount_id: budget.sub_head_cost_center_amount_id },
		attributes: ['amount', 'tax_duty_amount', 'provision_amount', 'revised_amount'],
		transaction,
	});
	const used = budgets.reduce((sum, b) => sum + allocationUsage(b), 0);
	const available = round2(Number(allocation.amount || 0) - used);
	if (revisionAmount > available + 0.005) {
		throw new AppError(
			`Revision of ${revisionAmount.toFixed(2)} exceeds the remaining cost center allocation (${available.toFixed(2)}).`,
			StatusCodes.BAD_REQUEST,
		);
	}
}

/**
 * Applies a finally-approved revision to its budget: re-snapshots previous/revised limit against
 * the limit actually in force right now (another revision may have landed since the request),
 * then increments Budget.revised_amount. Caller owns the transaction.
 */
async function applyApprovedRevision(req, revision, transaction) {
	const budget = await Budget.findOne({
		where: { id: revision.budget_id },
		transaction,
		lock: transaction.LOCK.UPDATE,
	});
	if (!budget) throw new AppError('Budget not found', StatusCodes.NOT_FOUND);

	const amount = round2(Number(revision.revision_amount));
	await assertAllocationHeadroom(budget, amount, transaction);

	const before = budget.toJSON();
	const previousLimit = effectiveCommitmentLimit(budget);
	await budget.update({ revised_amount: round2(Number(budget.revised_amount || 0) + amount) }, { transaction });

	await revision.update(
		{
			previous_limit: previousLimit,
			revised_limit: round2(previousLimit + amount),
			approved_by: actorSnapshot(req.user),
			approved_at: new Date(),
		},
		{ transaction },
	);

	await auditLogService.recordChange({
		req,
		entityType: 'budget',
		entityId: budget.id,
		action: 'revised',
		before,
		after: budget.toJSON(),
		transaction,
	});
}

exports.createBudgetRevision = async (req, body) => {
	const { org_id } = req.user;
	const revisionAmount = round2(Number(body.revision_amount));
	const reason = (body.reason || '').trim();

	if (!(revisionAmount > 0)) {
		throw new AppError('Revision amount must be greater than 0', StatusCodes.BAD_REQUEST);
	}
	if (!reason) {
		throw new AppError('A reason is required for a budget revision', StatusCodes.BAD_REQUEST);
	}

	let revisionId;
	const transaction = await sequelize.transaction();
	try {
		// Locked so two concurrent requests can't both pass the one-open-revision guard.
		const budget = await Budget.findOne({
			where: { id: body.budget_id, org_id },
			transaction,
			lock: transaction.LOCK.UPDATE,
		});
		if (!budget) throw new AppError('Budget not found', StatusCodes.NOT_FOUND);
		if (budget.sanc_by !== 'yes') {
			throw new AppError('Only an approved budget can be revised', StatusCodes.BAD_REQUEST);
		}

		const openCount = await BudgetRevision.count({
			where: { budget_id: budget.id, status: { [Op.in]: OPEN_STATUSES } },
			transaction,
		});
		if (openCount > 0) {
			throw new AppError(
				'This budget already has a revision awaiting approval. Approve, reject or cancel it first.',
				StatusCodes.CONFLICT,
			);
		}

		// Early feedback only — re-checked authoritatively at final approval.
		await assertAllocationHeadroom(budget, revisionAmount, transaction);

		const previousLimit = effectiveCommitmentLimit(budget);
		const revision = await BudgetRevision.create(
			{
				org_id,
				budget_id: budget.id,
				previous_limit: previousLimit,
				revision_amount: revisionAmount,
				revised_limit: round2(previousLimit + revisionAmount),
				reason,
				source_document_type: body.source_document_type || null,
				source_document_id: body.source_document_id || null,
				status: 'draft',
				requested_by: actorSnapshot(req.user),
				requested_at: new Date(),
			},
			{ transaction },
		);
		revisionId = revision.id;
		await revision.update({ revision_no: `BRV-${String(revision.id).padStart(6, '0')}` }, { transaction });

		const instance = await workflowEngine.startInstance({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: revision.id,
			orgId: org_id,
			transaction,
		});
		await revision.update({ status: instance.status }, { transaction });

		// A zero-stage definition ("no approval required") resolves straight to approved.
		if (instance.status === 'approved') {
			await applyApprovedRevision(req, revision, transaction);
		}

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: revision.id,
			action: 'requested',
			newState: { budget_id: budget.id, revision_amount: revisionAmount, reason },
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchRevisionOrThrow(revisionId);
};

exports.approveBudgetRevision = async (req, id, remarks) => {
	const forAssert = await fetchRevisionOrThrow(id);
	await revisionWorkflow.assertCanAct(req, forAssert);

	const stageNameBeforeAction = (
		await workflowEngine.getInstanceWithStages({ documentType: DOCUMENT_TYPE, documentId: id })
	).instance.currentStage?.stage_name ?? null;

	const transaction = await sequelize.transaction();
	try {
		// Row lock against double-approve (double-click, retry, two approvers racing).
		const revision = await BudgetRevision.findOne({ where: { id }, transaction, lock: transaction.LOCK.UPDATE });
		if (!OPEN_STATUSES.includes(revision.status)) {
			throw new AppError(`Cannot approve a revision with status "${revision.status}"`, StatusCodes.CONFLICT);
		}

		const instance = await workflowEngine.advanceStage({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: id,
			action: 'approved',
			remarks: remarks || null,
			transaction,
			documentContext: getDocumentContext(forAssert),
		});

		// Multi-stage chains call this once per stage; only the stage that resolves the
		// instance to 'approved' actually moves the budget.
		if (instance.status === 'approved') {
			await applyApprovedRevision(req, revision, transaction);
		}
		await revision.update({ status: instance.status }, { transaction });

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: id,
			action: 'approved',
			remarks: remarks || null,
			workflowStageName: stageNameBeforeAction,
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchRevisionOrThrow(id);
};

exports.rejectBudgetRevision = async (req, id, remarks) => {
	const revision = await fetchRevisionOrThrow(id);
	if (!OPEN_STATUSES.includes(revision.status)) {
		throw new AppError(`Cannot reject a revision with status "${revision.status}"`, StatusCodes.CONFLICT);
	}
	return revisionWorkflow.reject(req, id, remarks);
};

exports.cancelBudgetRevision = async (req, id, remarks) => {
	const revision = await fetchRevisionOrThrow(id);
	if (revision.status === 'approved') {
		throw new AppError('An approved budget revision cannot be cancelled', StatusCodes.CONFLICT);
	}
	if (!OPEN_STATUSES.includes(revision.status)) {
		throw new AppError(`This revision is already ${revision.status}`, StatusCodes.CONFLICT);
	}
	return revisionWorkflow.cancel(req, id, remarks);
};

exports.getBudgetRevision = async (req, id) => {
	const revision = await fetchRevisionOrThrow(id);
	if (Number(revision.org_id) !== Number(req.user.org_id)) {
		throw new AppError(`Budget Revision with ID ${id} not found`, StatusCodes.NOT_FOUND);
	}
	return revision;
};

exports.listBudgetRevisions = async (req, query = {}) => {
	const where = { org_id: req.user.org_id };
	if (query.budget_id) where.budget_id = Number(query.budget_id);
	if (query.status && query.status !== 'all') where.status = query.status;

	// Same department scope as the budget list itself.
	const budgetWhere = {};
	await dataVisibility.applyBudgetVisibility(budgetWhere, req.user);

	const limit = query.limit ? Number(query.limit) : undefined;
	return BudgetRevision.findAndCountAll({
		where,
		include: [
			{
				model: Budget,
				as: 'budget',
				attributes: ['id', 'budget_id', 'budgetType', 'department_id', 'unit_id', 'stnname'],
				where: budgetWhere,
				required: true,
			},
		],
		order: [['id', 'DESC']],
		...(limit ? { limit, offset: Number(query.offset || 0) } : {}),
	});
};

exports.getBudgetRevisionWorkflow = async (req, id) => revisionWorkflow.getWorkflow(req, id);
