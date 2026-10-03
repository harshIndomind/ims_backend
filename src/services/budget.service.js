const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { budgetRepo } = require('../repository/index');
const logger = require('../utils/logger');
const dataVisibility = require('./dataVisibility.service');
const { off } = require('pdfkit');
const {
	MasterMajorHead,
	MasterPeriod,
	MasterMajorHeadAmount,
	MasterSubHead,
	MasterSubHeadAmount,
	MasterSubHeadCostCenterAmount,
	Budget,
	IndentItem,
	PurchaseOrderItem,
	WorkOrderItem,
	organization,
	Department,
	CostCenter,
	MasterAccount,
	MasterUnit,
	User,
	Indent,
	BudgetRevision,
	PurchaseInvoice,
} = require('../models/index');
const {
	computeBudgetLimits,
	effectiveCommitmentLimit,
	allocationUsage,
	PROVISION_TYPE,
} = require('../utils/budget-limit.util');
const { getCommittedBudgetImpact, getIndentBudgetPosition } = require('./budget-validation.service');
const {
	getAmountByMajorHeadAndPeriod,
} = require('./masterMajorHeadAmount.service');
const auditLogService = require('./auditLog.service');
const { fn, col, Op, literal } = require('sequelize');
const parseDate = require('../utils/parse-date');

const ENTITY_TYPE = 'budget';

const validateBudgetDateInPeriod = async (date, period_id) => {
	if (!date || !period_id) return;

	const period = await MasterPeriod.findByPk(period_id, {
		attributes: ['id', 'from_date', 'end_date', 'period_short'],
	});
	if (!period || !period.from_date || !period.end_date) return;

	// Normalize to YYYY-MM-DD for safe string comparison (avoids timezone drift)
	const budgetDateStr =
		typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0];

	if (budgetDateStr < period.from_date || budgetDateStr > period.end_date) {
		throw new AppError(
			`Budget date must be within the period range (${period.from_date} to ${period.end_date})`,
			StatusCodes.BAD_REQUEST,
		);
	}
};

const validateBudgetPayload = (payload) => {
	if (payload.budgetType === 'item-wise') {
		if (!payload.product_id) {
			throw new AppError('Product is required for item-wise budget', StatusCodes.BAD_REQUEST);
		}
		if (!payload.qty_for_purchase || Number(payload.qty_for_purchase) < 1) {
			throw new AppError('Qty for purchase must be at least 1 for item-wise budget', StatusCodes.BAD_REQUEST);
		}
	}
	if (payload.budgetType === 'value-wise') {
		if (!payload.amount || Number(payload.amount) < 1) {
			throw new AppError('Amount must be at least 1 for value-wise budget', StatusCodes.BAD_REQUEST);
		}
	}
};

// Fields the server derives (utils/budget-limit.util.js) or only ever moves through an approved
// Budget Revision — never accepted from the request body.
const SERVER_OWNED_FIELDS = ['commitment_limit', 'revised_amount', 'budget_id'];

const stripServerOwnedFields = (payload) => {
	const clean = { ...payload };
	SERVER_OWNED_FIELDS.forEach((f) => delete clean[f]);
	return clean;
};

const validateProvisionAndPhases = (merged) => {
	if (merged.provision_type === PROVISION_TYPE.PERCENTAGE) {
		const pct = Number(merged.provision_percentage);
		if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
			throw new AppError('Provision percentage must be between 0 and 100', StatusCodes.BAD_REQUEST);
		}
	}
	if (merged.provision_type === PROVISION_TYPE.FIXED) {
		const amt = Number(merged.provision_amount);
		if (!Number.isFinite(amt) || amt < 0) {
			throw new AppError('Provision amount cannot be negative', StatusCodes.BAD_REQUEST);
		}
	}

	// Phase breakup must fit inside the approved budget (qty for item-wise, base amount for
	// value-wise) — previously enforced only by the form's zod schema.
	const phaseTotal =
		Number(merged.first_phase_qty || 0) + Number(merged.second_phase_qty || 0) + Number(merged.third_phase_qty || 0);
	const ceiling = merged.budgetType === 'value-wise' ? Number(merged.amount || 0) : Number(merged.qty_for_purchase || 0);
	if (phaseTotal > ceiling + 0.005) {
		throw new AppError(
			merged.budgetType === 'value-wise'
				? `Total phase amount (${phaseTotal}) cannot exceed Budget Amount (${ceiling})`
				: `Total phase quantity (${phaseTotal}) cannot exceed Qty For Purchase (${ceiling})`,
			StatusCodes.BAD_REQUEST,
		);
	}
};

/**
 * Server-side cost-centre allocation ceiling: Σ (base + tax + provision + approved revisions)
 * of every budget on the allocation must stay within the allocation amount. Previously only
 * the budget form checked this.
 */
const validateAllocationCeiling = async (sub_head_cost_center_amount_id, candidate, excludeBudgetId, transaction) => {
	const allocation = await MasterSubHeadCostCenterAmount.findByPk(sub_head_cost_center_amount_id, { transaction });
	if (!allocation) return;
	const others = await Budget.findAll({
		where: {
			sub_head_cost_center_amount_id,
			...(excludeBudgetId ? { id: { [Op.ne]: excludeBudgetId } } : {}),
		},
		attributes: ['amount', 'tax_duty_amount', 'provision_amount', 'revised_amount'],
		transaction,
	});
	const used = others.reduce((sum, b) => sum + allocationUsage(b), 0);
	const requested = allocationUsage(candidate);
	const available = Number(allocation.amount || 0) - used;
	if (requested > available + 0.005) {
		throw new AppError(
			`Base amount + tax + provision (${requested.toFixed(2)}) exceeds the remaining cost center allocation (${available.toFixed(2)})`,
			StatusCodes.BAD_REQUEST,
		);
	}
};

// A budget's cost center is not picked freely — it must be a real cost-centre split of
// the chosen sub-head amount (MasterSubHeadCostCenterAmount), so major_head/sub_head/
// period/major_head_amount/sub_head_amount/cost_center are all derived from that one
// allocation row rather than trusted independently off the request body. This is what
// keeps the ceiling-enforcement scope (the allocation) and the report/display tag
// (Budget.cost_center_id) from ever disagreeing.
const resolveCostCenterAllocation = async (org_id, payload) => {
	const { sub_head_cost_center_amount_id, major_head_id, sub_head_id, period_id } = payload;

	if (!sub_head_cost_center_amount_id) {
		throw new AppError(
			'A cost center allocation must be selected for this budget',
			StatusCodes.BAD_REQUEST,
		);
	}

	const allocation = await MasterSubHeadCostCenterAmount.findByPk(sub_head_cost_center_amount_id, {
		include: [
			{ model: MasterSubHeadAmount, as: 'subHeadAmount', attributes: ['id', 'major_head_amount_id'] },
		],
	});

	if (!allocation) {
		throw new AppError('Cost center allocation not found', StatusCodes.NOT_FOUND);
	}
	if (allocation.org_id && Number(allocation.org_id) !== Number(org_id)) {
		throw new AppError(
			'Cost center allocation does not belong to your organization',
			StatusCodes.FORBIDDEN,
		);
	}
	if (
		(major_head_id && Number(major_head_id) !== Number(allocation.major_head_id)) ||
		(sub_head_id && Number(sub_head_id) !== Number(allocation.sub_head_id)) ||
		(period_id && Number(period_id) !== Number(allocation.period_id))
	) {
		throw new AppError(
			'Cost center allocation does not match the selected major head, sub head and period',
			StatusCodes.BAD_REQUEST,
		);
	}

	return {
		major_head_id: allocation.major_head_id,
		sub_head_id: allocation.sub_head_id,
		period_id: allocation.period_id,
		major_head_amount_id: allocation.subHeadAmount.major_head_amount_id,
		sub_head_amount_id: allocation.sub_head_amount_id,
		cost_center_id: allocation.cost_center_id,
		sub_head_cost_center_amount_id: allocation.id,
	};
};

exports.createBudget = async (req, rawPayload) => {
	const input = stripServerOwnedFields(rawPayload);
	validateBudgetPayload(input);
	await validateBudgetDateInPeriod(input.date, input.period_id);
	const { org_id } = req.user;

	const payload = { ...input, ...computeBudgetLimits(input) };
	validateProvisionAndPhases(payload);

	const resolvedAllocation = await resolveCostCenterAllocation(org_id, payload);
	await validateAllocationCeiling(resolvedAllocation.sub_head_cost_center_amount_id, payload, null);
	const budget = await budgetRepo.create({ ...payload, ...resolvedAllocation, org_id });

	if (budget) {
		budgetID = `BUD-${String(budget.id).padStart(6, '0')}`;
		await budgetRepo.updateById(budget.id, { budget_id: budgetID });
	}

	const created = await budgetRepo.findById(budget.id);

	await auditLogService.record({
		req,
		entityType: ENTITY_TYPE,
		entityId: created.id,
		action: 'create',
		newState: created.toJSON(),
	});

	return created;
};

exports.updateBudget = async (req, id, rawPayload) => {
	const input = stripServerOwnedFields(rawPayload);
	const budget = await budgetRepo.findById(id);

	if (!budget) {
		throw new AppError('Budget not found', StatusCodes.NOT_FOUND);
	}

	// Prevent update if any indent has been raised against this budget
	const indentCount = await IndentItem.count({ where: { budget_id: id } });
	if (indentCount > 0) {
		throw new AppError(
			'This budget has linked indents and cannot be updated',
			StatusCodes.BAD_REQUEST,
		);
	}

	const before = budget.toJSON();

	const mergedType = input.budgetType ?? budget.budgetType;
	const merged = { ...budget.dataValues, ...input, budgetType: mergedType };
	validateBudgetPayload(merged);

	const computed = computeBudgetLimits(merged);
	const payload = { ...input, ...computed };
	validateProvisionAndPhases({ ...merged, ...computed });

	// Validate effective date (from payload or existing record) against period bounds
	const effectiveDate = payload.date ?? budget.date;
	const effectivePeriodId = payload.period_id ?? budget.period_id;
	await validateBudgetDateInPeriod(effectiveDate, effectivePeriodId);

	const resolvedAllocation = await resolveCostCenterAllocation(req.user.org_id, {
		...payload,
		sub_head_cost_center_amount_id:
			payload.sub_head_cost_center_amount_id ?? budget.sub_head_cost_center_amount_id,
	});

	await validateAllocationCeiling(
		resolvedAllocation.sub_head_cost_center_amount_id,
		{ ...computed, revised_amount: budget.revised_amount },
		Number(id),
	);

	const updated = await budgetRepo.updateById(id, { ...payload, ...resolvedAllocation });

	await auditLogService.recordChange({
		req,
		entityType: ENTITY_TYPE,
		entityId: Number(id),
		action: 'update',
		before,
		after: updated.toJSON(),
	});

	return updated;
};

exports.getAllBudgets = async (req) => {
	const {org_id, role} = req.user;
	const {
		limit,
		offset,
		fromDate,
		toDate,
		selectedPeriodId,
		selectedUnitId,
		selectedDepartmentId,
		selectedStatusId,
		selectedCostCenterId,
		selectedBudgetTypeId,
		selectedCategoryId,
		budgetId,
		sortOrder,
	} = req.query;

	const where = { org_id };

	if (budgetId) {
		where.budget_id = budgetId;
	} else {
		if (!fromDate || !toDate) {
			throw new AppError('fromDate and toDate are required');
		}

		const from_date = parseDate(fromDate);
		const to_date = parseDate(toDate);
		to_date.setDate(to_date.getDate() + 1);

		if (isNaN(from_date) || isNaN(to_date)) {
			throw new AppError('Invalid date range');
		}

		where.createdAt = {
			[Op.gte]: from_date,
			[Op.lt]: to_date,
		};
	}

	const periodId = Number(selectedPeriodId);
	const unitId = Number(selectedUnitId);
	const departmentId = Number(selectedDepartmentId);
	const costCenterId = Number(selectedCostCenterId);

	if (selectedBudgetTypeId != 'all') where.budgetType = selectedBudgetTypeId;
	if (selectedStatusId != 'all') where.is_lock = selectedStatusId === 'lock' ? 1 : 0;
	if (periodId > 0) where.period_id = periodId;
	if (unitId > 0) where.unit_id = unitId;
	if (departmentId > 0) where.department_id = departmentId;
	if (costCenterId > 0) where.cost_center_id = costCenterId;
	if (selectedCategoryId != 'all') where.category = selectedCategoryId;

	// Role-based data visibility — applied AFTER query-param filters so that
	// non-admin users cannot bypass their department scope by sending an arbitrary
	// selectedDepartmentId in the query string.
	// super_admin / org_admin: no filter applied.
	// All other roles: restricts to the user's own department_id across all units.
	await dataVisibility.applyBudgetVisibility(where, req.user);

	logger.debug("where ", {where})
	const filterOptions = {
		where,
		attributes: {
			include: [
				[
					literal('(SELECT COUNT(DISTINCT `indent_id`) FROM `IndentItems` WHERE `budget_id` = `Budget`.`id`)'),
					'indent_count',
				],
			],
		},
		include: [
			{
				model: MasterMajorHead,
				as: 'majorHead',
				attributes: ['id', 'm_code', 'm_name'],
			},
			{
				model: MasterSubHead,
				as: 'subHead',
				attributes: ['id', 'sh_code', 'sh_name'],
			},
			{
				model: MasterPeriod,
				as: 'period',
				attributes: ['id', 'period_short', 'period', 'period_detail'],
			},
			{
				model: organization,
				as: 'organization',
			},
			{
				model: Department,
				as: 'department',
				attributes: ['id', 'name'],
			},
			{
				model: MasterUnit,
				as: 'unit',
				attributes: ['id', 'unitName', 'unitCd'],
			},
			{
				model: CostCenter,
				as: 'cost_center',
				attributes: ['id', 'code', 'name'],
				include: {
					model: MasterAccount,
					as: 'account',
					attributes: ['id', 'A_NAME', 'A_CODE'],
				},
			},
			{
				model: User,
				as: 'approver',
				attributes: ['id', 'name', 'email'],
				required: false,
			},
		],
	};

	filterOptions.order = [['id', sortOrder === 'asc' ? 'ASC' : 'DESC']];

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
	}

	const result = await budgetRepo.findAll({}, filterOptions);

	// Paginated list only (not the report export): attach each budget's live remaining —
	// effective limit minus indents/PO/WO/invoices, same figure the indent live check uses.
	if (limit && result?.rows?.length) {
		await Promise.all(
			result.rows.map(async (budget) => {
				const pos = await getIndentBudgetPosition({ budget });
				budget.setDataValue('effective_limit', pos.effectiveLimit);
				budget.setDataValue('consumed_amount', pos.consumedByOthers);
				budget.setDataValue('remaining_amount', pos.available);
			}),
		);
	}

	return result;
};

exports.getBudgetById = async (id) => {
	const budget = await budgetRepo.findById(id, {
		attributes: {
			include: [
				[
					literal('(SELECT COUNT(*) FROM `IndentItems` WHERE `budget_id` = `Budget`.`id`)'),
					'indent_count',
				],
			],
		},
		include: [
			{ association: 'majorHead' },
			{ association: 'subHead' },
			{ association: 'period' },
			{ association: 'organization' },
		],
	});

	if (!budget) {
		throw new AppError('Budget not found', StatusCodes.NOT_FOUND);
	}

	return budget;
};

exports.deleteBudget = async (req, id) => {
	const budget = await budgetRepo.findById(id);

	if (!budget) {
		throw new AppError('Budget not found', StatusCodes.NOT_FOUND);
	}

	const indentCount = await IndentItem.count({ where: { budget_id: id } });
	if (indentCount > 0) {
		throw new AppError(
			`Cannot delete budget: it has ${indentCount} indent${indentCount > 1 ? 's' : ''} linked to it. Remove the indents first.`,
			StatusCodes.CONFLICT,
		);
	}

	// PurchaseOrderItems.budget_id and WorkOrderItems.budget_id are ON DELETE CASCADE —
	// a value-wise PO/WO item can reference this budget directly, without ever going
	// through an IndentItem. Deleting the budget unguarded would silently delete those
	// items off an otherwise-real purchase/work order.
	const poItemCount = await PurchaseOrderItem.count({ where: { budget_id: id } });
	if (poItemCount > 0) {
		throw new AppError(
			`Cannot delete budget: it is already used by ${poItemCount} Purchase Order item${poItemCount > 1 ? 's' : ''}. Remove it from those Purchase Orders first.`,
			StatusCodes.CONFLICT,
		);
	}

	const woItemCount = await WorkOrderItem.count({ where: { budget_id: id } });
	if (woItemCount > 0) {
		throw new AppError(
			`Cannot delete budget: it is already used by ${woItemCount} Work Order item${woItemCount > 1 ? 's' : ''}. Remove it from those Work Orders first.`,
			StatusCodes.CONFLICT,
		);
	}

	const revisionCount = await BudgetRevision.count({ where: { budget_id: id } });
	if (revisionCount > 0) {
		throw new AppError(
			`Cannot delete budget: it has ${revisionCount} budget revision${revisionCount > 1 ? 's' : ''} on record, which form its audit trail.`,
			StatusCodes.CONFLICT,
		);
	}

	const before = budget.toJSON();

	await budgetRepo.deleteById(id);

	await auditLogService.record({
		req,
		entityType: ENTITY_TYPE,
		entityId: Number(id),
		action: 'delete',
		previousState: before,
	});
};

const getSubAmountByMajorHeadAndPeriod = async (major_head_id, period_id) => {
	return await budgetRepo.getSubAmountByMajorHeadAndPeriod('amount', {
		where: { major_head_id, period_id },
	});
};

// exports.getAmountByMajorHeadAndPeriodAndSubHead = async (
// 	major_head_id,
// 	period_id,
// 	sub_head_id
// ) => {
// 	const whereClause = { major_head_id, period_id };
// 	const include = [];

// 	if (sub_head_id) {
// 		include.push({
// 			model: MasterSubHeadAmount,
// 			as: 'subHeadAmount',
// 			attributes: [['id', 'sub_head_amount_id'], 'amount'],
// 			where: { sub_head_id },
// 			required: true,
// 		});
// 	}
// 	logger.info('Fetching all Master Major Head Amounts');
// 	return await budgetRepo.getAmountByMajorHeadAndPeriodAndSubHead({
// 		where: whereClause,
// 		include,
// 		attributes: [['id', 'major_head_amount_id'], 'amount'],
// 	});
// };

exports.getAmountByMajorHeadAndPeriodAndSubHead = async (
	major_head_id,
	period_id,
	sub_head_id,
	exclude_budget_id,
) => {
	if (!major_head_id || !period_id || !sub_head_id) {
		throw new AppError(
			'major_head_id, period_id, and sub_head_id are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const whereClause = {
		major_head_id,
		period_id,
		sub_head_id,
	};

	const include = [
		{
			model: Budget,
			as: 'budgets',
			attributes: [],
			required: false,
			// Excludes the budget being edited from its own "amount used" total, so the
			// returned final_amount is the true ceiling available to that budget — the
			// caller no longer has to re-add its own contribution back on top of this.
			where: exclude_budget_id ? { id: { [Op.ne]: exclude_budget_id } } : undefined,
		},
	];

	return await budgetRepo.getAmountByMajorHeadAndPeriodAndSubHead({
		where: whereClause,
		include,
	});
};

exports.approveBudget = async (req, budget_ids, approved_by) => {
	if (!budget_ids || !Array.isArray(budget_ids) || budget_ids.length === 0) {
		throw new AppError(
			'budget_ids must be a non-empty array',
			StatusCodes.BAD_REQUEST,
		);
	}

	logger.info('Approving budgets', { budget_ids, approved_by });

	const updatedBudgets = [];
	const approved_at = new Date();

	for (const id of budget_ids) {
		logger.debug('Processing budget approval', { id, approved_by });

		const budget = await budgetRepo.findById(id);

		if (!budget) {
			logger.warn('Budget not found during approval', { id, approved_by });
			throw new AppError(
				`Budget with ID ${id} not found`,
				StatusCodes.NOT_FOUND,
			);
		}

		const before = budget.toJSON();

		const updatedBudget = await budgetRepo.updateById(id, {
			sanc_by: 'yes',
			is_lock: 0,
			approved_by,
			approved_at,
		});

		logger.info('Budget approved successfully', { id, approved_by, approved_at });

		await auditLogService.recordChange({
			req,
			entityType: ENTITY_TYPE,
			entityId: Number(id),
			action: 'approve',
			before,
			after: updatedBudget.toJSON(),
		});

		updatedBudgets.push(updatedBudget);
	}

	return updatedBudgets;
};

exports.getAllApprovedBudgets = async (req) => {
	const { limit, offset, budgetType, periodId, departmentId } = req.query;

	const options = {};
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset || 0);
	}

	const where = { sanc_by: 'yes', is_lock: 0 };

	if (budgetType !== 'all') where.budgetType = budgetType;
	if (periodId) where.period_id = periodId;
	if (departmentId) where.department_id = departmentId;

	await dataVisibility.applyBudgetVisibility(where, req.user);

	return budgetRepo.findAll(
		{ where },
		{
			include: [
				{
					model: MasterPeriod,
					as: 'period',
					attributes: ['id', 'period_short', 'period', 'period_detail'],
				},
				{
					model: MasterMajorHead,
					as: 'majorHead',
					attributes: ['id', 'm_name', 'm_code'],
				},
				{
					model: MasterSubHead,
					as: 'subHead',
					attributes: ['id', 'sh_name', 'sh_code'],
				},
				{ model: organization, as: 'organization' },
				{ model: Department, as: 'department', attributes: ['id', 'name'] },
				{
					model: User,
					as: 'approver',
					attributes: ['id', 'name', 'email'],
					required: false,
				},
			],
		},
	);
};

exports.searchBudgets = async ({ org_id, search = '', limit = 20, user }) => {
	const where = {
		org_id,
		...(search ? { budget_id: { [Op.like]: `%${search}%` } } : {}),
	};

	if (user) await dataVisibility.applyBudgetVisibility(where, user);

	return Budget.findAll({
		where,
		attributes: ['id', 'budget_id', 'budgetType'],
		order: [['budget_id', 'ASC']],
		limit: Number(limit),
	});
};

/**
 * Explainable budget position (docs/budget-validation/budget-modification.md "Reporting / Audit"):
 *   Base + Tax (if non-recoverable) + Provision = Commitment Limit; + Approved Revisions = Effective Limit
 *   Indented (active indents, base budget) and Committed (PO/WO budget impact) vs those limits.
 */
exports.getBudgetUtilization = async (req, id) => {
	const budget = await Budget.findOne({ where: { id, org_id: req.user.org_id } });
	if (!budget) {
		throw new AppError('Budget not found', StatusCodes.NOT_FOUND);
	}

	const indentItems = await IndentItem.findAll({
		where: { budget_id: id },
		include: [
			{
				model: Indent,
				as: 'indent',
				attributes: [],
				required: true,
				where: { status: { [Op.notIn]: ['rejected', 'cancelled'] } },
			},
		],
		attributes: ['amount', 'qty'],
	});
	const indentedAmount = indentItems.reduce((sum, i) => sum + Number(i.amount || 0), 0);
	const indentedQty = indentItems.reduce((sum, i) => sum + Number(i.qty || 0), 0);

	const { committed, breakdown } = await getCommittedBudgetImpact({ budget });
	const effectiveLimit = effectiveCommitmentLimit(budget);

	const revisions = await BudgetRevision.findAll({
		where: { budget_id: id },
		order: [['id', 'DESC']],
	});

	// Invoices booked against each committed PO/WO, so the UI can show PO → Invoice hierarchy.
	const poIds = breakdown.filter((d) => d.document_type === 'purchase_order').map((d) => d.document_id);
	const woIds = breakdown.filter((d) => d.document_type === 'work_order').map((d) => d.document_id);
	const invoices =
		poIds.length || woIds.length
			? await PurchaseInvoice.findAll({
					where: {
						org_id: req.user.org_id,
						status: { [Op.notIn]: ['rejected', 'cancelled'] },
						[Op.or]: [
							...(poIds.length ? [{ purchase_order_id: { [Op.in]: poIds } }] : []),
							...(woIds.length ? [{ work_order_id: { [Op.in]: woIds } }] : []),
						],
					},
					attributes: [
						'id',
						'document_type',
						'purchase_order_id',
						'work_order_id',
						'invoicePrefix',
						'invoiceNo',
						'invoicePostfix',
						'vendor_invoice_no',
						'invoice_date',
						'grandTotal',
						'status',
					],
					order: [['id', 'ASC']],
				})
			: [];
	const committedDocuments = breakdown.map((d) => ({
		...d,
		invoices: invoices
			.filter((inv) =>
				d.document_type === 'purchase_order'
					? inv.purchase_order_id === d.document_id
					: inv.work_order_id === d.document_id,
			)
			.map((inv) => ({
				id: inv.id,
				invoice_number: `${inv.invoicePrefix || ''}${inv.invoiceNo || ''}${inv.invoicePostfix || ''}`,
				vendor_invoice_no: inv.vendor_invoice_no,
				invoice_date: inv.invoice_date,
				grand_total: Number(inv.grandTotal || 0),
				status: inv.status,
			})),
	}));

	const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
	const isItemWise = budget.budgetType === 'item-wise';

	return {
		id: budget.id,
		budget_id: budget.budget_id,
		budgetType: budget.budgetType,
		base_amount: Number(budget.amount || 0),
		tax_duty_amount: Number(budget.tax_duty_amount || 0),
		tax_budget_impact: budget.tax_budget_impact,
		provision_type: budget.provision_type,
		provision_percentage: budget.provision_percentage,
		provision_amount: Number(budget.provision_amount || 0),
		commitment_limit: effectiveCommitmentLimit({ ...budget.get({ plain: true }), revised_amount: 0 }),
		revised_amount: Number(budget.revised_amount || 0),
		effective_limit: effectiveLimit,
		// Quantity only means something for an item-wise (single-product) budget.
		approved_qty: isItemWise ? Number(budget.qty_for_purchase || 0) : null,
		indented_qty: isItemWise ? indentedQty : null,
		remaining_qty: isItemWise ? round2(Number(budget.qty_for_purchase || 0) - indentedQty) : null,
		indented_amount: round2(indentedAmount),
		remaining_base_amount: round2(Number(budget.amount || 0) - indentedAmount),
		committed_amount: committed,
		remaining_commitment: round2(effectiveLimit - committed),
		committed_documents: committedDocuments,
		revisions,
	};
};
