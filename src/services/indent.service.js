const {
	VCP_SERVICE_API_BASE_URL,
	VCP_SERVICE_PRODUCT_ENDPOINT,
	S2S_COMM_KEY,
} = require('../config/serverConfig');
const { sequelize } = require('../models/index');
// const indentRepo = require('../repositories/indent.repository');
const {
	IndentRepository,
	IndentItemRepository,
	IndentSerialRepository,
} = require('../repository/index');
const { fetch } = require('undici');
const {
	Indent,
	Budget,
	IndentSerialItem,
	IndentItem,
	MasterUnit
} = require('../models/index');
const AppError = require('../utils/AppError');
const { Op, literal } = require('sequelize');
const logger = require('../utils/logger');
const { StatusCodes } = require('http-status-codes');
const parseDate = require('../utils/parse-date');
const crypto = require('crypto');
const workflowEngine = require('./workflowEngine.service');
const auditLogService = require('./auditLog.service');
const { createWorkflowDocumentService } = require('./workflowDocument.factory');

const DOCUMENT_TYPE = 'indent';

function actorSnapshot(user) {
	return user ? { id: user.id, name: user.name, email: user.email } : null;
}

// Generic lifecycle actions (reject/cancel/reopen/archive/restore/read) delegate to the
// shared factory — see workflowDocument.factory.js for why verify/approve do not.
const indentWorkflow = createWorkflowDocumentService({
	documentType: DOCUMENT_TYPE,
	fetchById: (id) => fetchIndentForWorkflowAction(id),
	getDocumentContext: (indent) => ({ department_id: indent.department_id, unit_id: indent.unit_id }),
});

exports.createIndent = async (req, payload) => {
	const transaction = await sequelize.transaction();

	try {
		const user = req.user;
		const createdBy = {
			id: user.id,
			name: user.name,
			email: user.email,
		};

		const {
			selectedIndents,
			item, // optional single item
			unit,
			...indentPayload
		} = payload;

		if (!Array.isArray(selectedIndents) || selectedIndents.length === 0) {
			throw new AppError('At least one item is required to create an indent.', StatusCodes.BAD_REQUEST);
		}

		// [2026-06-03] Validate budget phase limits BEFORE writing any DB records.
		// WHY: Frontend validation can be bypassed (commented out, API called directly, etc).
		// Without this, over-budget indents can be saved and only get caught at approval time,
		// which is too late — the approver would have to reject and the user would need to
		// re-create the indent. Failing fast at creation is cheaper and clearer.
		if (Array.isArray(selectedIndents) && selectedIndents.length > 0) {
			const indentDate = indentPayload.indent_date
				? new Date(indentPayload.indent_date)
				: new Date();
			const errorMessage = await validateBudgetPhaseOnCreate(
				selectedIndents,
				indentDate,
				indentPayload.budgetType,
			);
			if (errorMessage) {
				throw new AppError(errorMessage, StatusCodes.BAD_REQUEST);
			}
		}
		
		// 🔹 Create Indent
		const indent = await IndentRepository.create(
			{
				...indentPayload,
				unit_id: unit,
				department_id: 1,
				// place_of_use_id is optional; the form sends '' when unselected, which
				// MySQL rejects as an invalid integer literal for this column
				place_of_use_id: indentPayload.place_of_use_id ? Number(indentPayload.place_of_use_id) : null,
				createdBy,
				org_id: user.org_id,
			},
			{ transaction },
		);

		// 🔹 Generate Indent Number
		const indentNo = `IND-${String(indent.id).padStart(6, '0')}`;

		await IndentRepository.updateById(
			indent.id,
			{ indent_no: indentNo },
			{ transaction },
		);

		// 🔹 Prepare Items Array
		let itemsToCreate = [];

		if (Array.isArray(selectedIndents) && selectedIndents.length > 0) {
			for (const i of selectedIndents) {
				const indentItem = await IndentItemRepository.create(
					{
						indent_id: indent.id,
						budget_id: i.budget_id,
						model_id: i.model || null,
						product_id: Number(i.product_id),
						batch_id: Number(i.batch_id) || null,
						item_name: i.product_name,
						item_code: i.product_code,
						uom_id: i.selected_uom_id || null,
						uom_name: i.selected_uom_unit || null,
						qty: i.qty,
						requested_qty: i.qty,
						avg_rate: i.price,
						discount: i.discount,
						amount: i.total,
						issue_date: i.issue_date,
						days: i.days,
						specification: i.specification,
						stock_type: i.stock_type,
						productSnapshot: i || null,
					},
					{ transaction },
				);

				if (i.stock_type === 'serial' && i.selectedSerials?.length) {
					await Promise.all(
						i.selectedSerials.map((serialNo) =>
							IndentSerialRepository.create(
								{
									indent_item_id: indentItem.id,
									product_id: i.product_id,
									serial_no: serialNo.trim(),
								},
								{ transaction },
							),
						),
					);
				}
			}
		}

		// Every Indent gets a workflow instance the moment it's created — there is no
		// separate "save as draft" step in the current create flow, so creation doubles as
		// submission into the first configured stage.
		const instance = await workflowEngine.startInstance({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: indent.id,
			orgId: user.org_id,
			transaction,
		});
		await IndentRepository.updateById(indent.id, { status: instance.status }, { transaction });

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: indent.id,
			action: 'create',
			newState: { indent_no: indentNo, ...indentPayload },
			transaction,
		});

		await transaction.commit();

		return IndentRepository.findById({
			where: { id: indent.id },
			include: [
				{ association: 'department' },
				{ association: 'period' },
				{ association: 'remark' },
				{ association: 'placeOfUse' },
				{
					association: 'IndentItems',
					include: [
						{
							model: IndentSerialItem,
							as: 'serial_items',
						},
						{
							model: Budget,
							as: 'budget',
						},
					],
				},
			],
		});
	} catch (error) {
		await transaction.rollback();
		throw error;
	}
};

exports.getNextIndentId = async (req) => {
	const lastIndent = await IndentRepository.findLastCreated();

	if (!lastIndent) {
		return 'IND-000001';
	}

	const lastId = parseInt(lastIndent.indent_no.split('-')[1]);

	const nextId = String(lastId + 1).padStart(6, '0');
	return `IND-${nextId}`;
};

exports.getAllIndents = async (req) => {
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
		selectedBudgetTypeId,
		indentNo,
		hasPurchaseQuantityIssue = false,
		hasPendingReissueQty = false,
		selectedBudgetId,
	} = req.query;

	// if (!fromDate || !toDate) {
	// 	throw new AppError('fromDate and toDate are required');
	// }

	const where = {
		org_id,
		// isVerified: selectedStatusId === 'yes' ? 1 : 0,
		// createdAt: {
		// 	[Op.gte]: from_date,
		// 	[Op.lt]: to_date,
		// },
	};

	// 'yes'/'no' are the original filter values (verified vs not) — preserved for the
	// existing frontend dropdown. 'rejected'/'cancelled' are new values the dropdown now
	// also offers. All four map onto the workflow-driven `status` column, not the legacy
	// isVerified boolean, so rejected/cancelled indents are distinguishable from "pending".
	if (selectedStatusId === 'yes') where.status = 'approved';
	if (selectedStatusId === 'no') where.status = { [Op.in]: ['draft', 'in_progress'] };
	if (selectedStatusId === 'rejected') where.status = 'rejected';
	if (selectedStatusId === 'cancelled') where.status = 'cancelled';
	if (selectedBudgetTypeId != 'all') where.budgetType = selectedBudgetTypeId;

	if (fromDate && toDate) {
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
	const budgetId = Number(selectedBudgetId);

	if (periodId > 0) where.period_id = periodId;
	if (unitId > 0) where.unit_id = unitId;
	if (departmentId > 0) where.department_id = departmentId;
	if (indentNo) where.indent_no = indentNo;

	logger.debug("hasPurchaseQuantityIssue ", {hasPurchaseQuantityIssue});
	logger.debug("Get All Indents Where ", {where});
	
	const indentItemsWhere = {};
	if (hasPurchaseQuantityIssue == true) {
		indentItemsWhere['qty_for_purchase_order'] = {
			[Op.gt]: 0,
		};
	}
	// Indents still owed qty once stock comes back in (post-PO/GRN re-issue queue) —
	// independent of qty_for_purchase_order, which only tracks open-PO balance.
	if (hasPendingReissueQty == true) {
		indentItemsWhere['balance_indent_qty'] = {
			[Op.gt]: 0,
		};
	}
	if (budgetId > 0) {
		indentItemsWhere['budget_id'] = budgetId;
	}
	logger.debug("indentItemsWhere ", {indentItemsWhere})
	const filterOptions = {
		where,
		attributes: {
			include: [
				[
					literal('(SELECT COUNT(*) FROM `PurchaseOrders` WHERE `indent_id` = `Indent`.`id`)'),
					'po_count',
				],
				[
					literal('(SELECT COUNT(*) FROM `WorkOrders` WHERE `indent_id` = `Indent`.`id`)'),
					'wo_count',
				],
				// Workflow status is derived (not duplicated) — joined here as a scalar
				// subquery, same pattern as po_count/wo_count above, to avoid an N+1 query
				// per row while still keeping workflow_instances as the source of truth.
				[
					literal(
						"(SELECT ws.stage_name FROM `workflow_instances` wi LEFT JOIN `workflow_stages` ws ON ws.id = wi.current_stage_id WHERE wi.document_type = 'indent' AND wi.document_id = `Indent`.`id` LIMIT 1)",
					),
					'current_stage_name',
				],
				[
					literal(
						"(SELECT wi.status FROM `workflow_instances` wi WHERE wi.document_type = 'indent' AND wi.document_id = `Indent`.`id` LIMIT 1)",
					),
					'workflow_status',
				],
			],
		},
		include: [
			{ association: 'department' },
			{ association: 'period' },
			{ association: 'remark' },
			{ association: 'placeOfUse' },
			{
				model: IndentItem,
				as: 'IndentItems',
				where: indentItemsWhere,
				// separate: false,
				// required: true,
				include: [
					{
						model: Budget,
						as: 'budget',
						attributes: ['budget_id'],
					},
					{
						model: IndentSerialItem,
						as: 'serial_items',
						attributes: ['serial_no', 'is_issued'],
					},
				],
			},
			{
				model: MasterUnit,
				as: 'unit',
				attributes: ['id', 'unitName', 'unitCd']
			}
		],
		order: [['createdAt', 'DESC']],
	};

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
	}

	const result = await IndentRepository.findAll({}, filterOptions);

	// display_status is computed from the two derived columns already in the row — no
	// extra query needed (see the literal() subqueries above).
	result.rows = result.rows.map((indent) => {
		indent.dataValues.display_status = workflowEngine.computeDisplayStatus(
			indent.dataValues.workflow_status,
			indent.dataValues.current_stage_name,
		);
		return indent;
	});

	return result;
};

exports.verifyIndentQuantity = async (req, indent_ids) => {
	if (!indent_ids || !Array.isArray(indent_ids) || indent_ids.length === 0) {
		throw new AppError(
			'Indent ids must be a non-empty array',
			StatusCodes.BAD_REQUEST,
		);
	}

	const updatedIndents = [];
	let verifiedQuantities = [];
	for (const id of indent_ids) {
		const indent = await IndentRepository.findById({
			where: { id },
			include: [
				{ association: 'department' },
				{ association: 'period' },
				{ association: 'remark' },
				{ association: 'placeOfUse' },
				{
					association: 'IndentItems',
					include: [
						{
							model: IndentSerialItem,
							as: 'serial_items',
						},
						{
							model: Budget,
							as: 'budget',
						},
					],
				},
			],
		});
		console.log(`indent for ${id}`, indent.get({ plain: true }));

		if (!indent) {
			throw new AppError(
				`Indent with ID ${id} not found`,
				StatusCodes.NOT_FOUND,
			);
		}

		if (Array.isArray(indent.IndentItems) && indent.IndentItems.length > 0) {
			console.log('indent.IndentItems ', indent.IndentItems);

			const { allocationResults } =
				await verifyIndentQuantityWithProductServices(req, indent.IndentItems);
			verifiedQuantities = allocationResults ?? [];

			console.log('Verify Indent Quantity Response ', allocationResults);
		}
	}

	return verifiedQuantities;
};

async function fetchIndentForWorkflowAction(id) {
	const indent = await IndentRepository.findById({
		where: { id },
		include: [
			{ association: 'department' },
			{ association: 'period' },
			{ association: 'remark' },
			{ association: 'placeOfUse' },
			{
				association: 'IndentItems',
				include: [
					{ model: IndentSerialItem, as: 'serial_items' },
					{ model: Budget, as: 'budget' },
				],
			},
		],
	});
	if (!indent) {
		throw new AppError(`Indent with ID ${id} not found`, StatusCodes.NOT_FOUND);
	}
	return indent;
}

/**
 * Verify stage: dry-run only against VCP (no stock mutation) — persists the verifier's
 * proposed issue quantities as advisory numbers on each IndentItem, then advances the
 * workflow to the Approver stage. Because no VCP allocation happens here, there is never
 * anything to compensate if the indent is later rejected.
 */
exports.verifyIndent = async (req, id, items) => {
	const indent = await fetchIndentForWorkflowAction(id);
	await indentWorkflow.assertCanAct(req, indent);
	const stageNameBeforeAction = (
		await workflowEngine.getInstanceWithStages({ documentType: DOCUMENT_TYPE, documentId: id })
	).instance.currentStage?.stage_name ?? null;

	if (!items || !Array.isArray(items) || items.length === 0) {
		throw new AppError('Updated indents must be a non-empty array', StatusCodes.BAD_REQUEST);
	}
	if (!Array.isArray(indent.IndentItems) || indent.IndentItems.length === 0) {
		throw new AppError('Indent has no items to verify', StatusCodes.BAD_REQUEST);
	}

	const updatedIndentQuantityMap = new Map(items.map((i) => [i.product_id, i]));
	for (const i of indent.IndentItems) {
		if (!updatedIndentQuantityMap.has(i.product_id)) {
			throw new AppError(`Missing issue_qty for ${i.item_name}`, StatusCodes.BAD_REQUEST);
		}
	}

	const plainIndentItems = indent.IndentItems.map((i) => i.get({ plain: true }));
	const { allocationResults: dryRunResults } =
		await verifyIndentQuantityWithProductServices(req, plainIndentItems, false);
	const dryRunMap = new Map(dryRunResults.map((i) => [i.product_id, i]));

	// The verifier may only propose issuing up to what's actually available — never more.
	for (const i of indent.IndentItems) {
		const availableForIssue = dryRunMap.get(i.product_id)?.issued_qty ?? 0;
		const submittedIssueQty = updatedIndentQuantityMap.get(i.product_id).issue_qty;
		if (submittedIssueQty > availableForIssue) {
			throw new AppError(
				`Issue qty for ${i.item_name} cannot exceed available qty (${availableForIssue})`,
				StatusCodes.BAD_REQUEST,
			);
		}
	}

	const transaction = await sequelize.transaction();
	try {
		for (const i of indent.IndentItems) {
			const dryRun = dryRunMap.get(i.product_id);
			const proposedQty = updatedIndentQuantityMap.get(i.product_id).issue_qty;

			await i.update(
				{
					qty_for_purchase_order: dryRun?.qty_for_purchase_order || 0,
					minimum_stock_quantity: dryRun?.minimum_stock_quantity || 0,
					checkMinimumStock: dryRun?.checkMinimumStock || false,
					qty_updated_by_verifier: proposedQty,
					// Advisory only — verify can be re-run before approval, so balance_indent_qty
					// (the live PO balance) is intentionally not initialized here, only at approve.
					qty_in_stock: dryRun?.total_available_quantity || 0,
				},
				{ transaction },
			);
		}

		const instance = await workflowEngine.advanceStage({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: id,
			action: 'verified',
			transaction,
		});

		await indent.update({ status: instance.status }, { transaction });

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: id,
			action: 'verified',
			workflowStageName: stageNameBeforeAction,
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchIndentForWorkflowAction(id);
};

exports.approveIndent = async (req, id, items) => {
	const user = req.user;
	const approvedBy = actorSnapshot(user);

	// --- Phase 0: fetch indent and validate inputs before touching any external service ---
	const indent = await fetchIndentForWorkflowAction(id);
	await indentWorkflow.assertCanAct(req, indent);
	const stageNameBeforeAction = (
		await workflowEngine.getInstanceWithStages({ documentType: DOCUMENT_TYPE, documentId: id })
	).instance.currentStage?.stage_name ?? null;

	if (!items || !Array.isArray(items) || items.length === 0) {
		throw new AppError('Updated indents must be a non-empty array', StatusCodes.BAD_REQUEST);
	}

	const updatedIndentQuantityMap = new Map(items.map((i) => [i.product_id, i]));

	// Verify every indent item has a matching entry in the caller-supplied map
	for (const i of indent.IndentItems) {
		if (!updatedIndentQuantityMap.has(i.product_id)) {
			throw new AppError(
				`Missing issue_qty for ${i.item_name}`,
				StatusCodes.BAD_REQUEST,
			);
		}
	}

	if (!Array.isArray(indent.IndentItems) || indent.IndentItems.length === 0) {
		throw new AppError('Indent has no items to approve', StatusCodes.BAD_REQUEST);
	}

	const plainIndentItems = indent.IndentItems.map((i) => i.get({ plain: true }));

	// --- Phase 1: re-validate against the CURRENT requested qty (never the verifier's
	// edited issue_qty) so the backorder/qty_for_purchase_order is always derived from the
	// real shortfall, regardless of what the verifier/approver types in. Re-running this at
	// approve time (rather than trusting the verify-stage's dry-run) matters because stock
	// may have moved between verify and approve. ---
	const { allocationResults: dryRunResults } =
		await verifyIndentQuantityWithProductServices(req, plainIndentItems, false);

	const dryRunMap = new Map(dryRunResults.map((i) => [i.product_id, i]));

	if (indent.budgetType === 'value-wise') {
		const errorMessage = await validateIndentBudgetAmount(indent, dryRunMap);
		if (errorMessage) {
			throw new AppError(errorMessage, StatusCodes.BAD_REQUEST);
		}
	}

	// The approver may only confirm issuing up to what's actually available — never more.
	for (const i of indent.IndentItems) {
		const availableForIssue = dryRunMap.get(i.product_id)?.issued_qty ?? 0;
		const submittedIssueQty = updatedIndentQuantityMap.get(i.product_id).issue_qty;
		if (submittedIssueQty > availableForIssue) {
			throw new AppError(
				`Issue qty for ${i.item_name} cannot exceed available qty (${availableForIssue})`,
				StatusCodes.BAD_REQUEST,
			);
		}
	}

	// --- Phase 2: actual allocation (VCP deducts stock in its own committed transaction),
	// deducting only the amount the approver confirmed. This is the FIRST point at which
	// real stock is mutated for this indent — verify is purely advisory (see verifyIndent). ---
	const modifiedIndentItems = plainIndentItems.map((item) => ({
		...item,
		qty: updatedIndentQuantityMap.get(item.product_id).issue_qty,
	}));

	// One key per approval attempt: shared between the allocation call and its
	// compensating rollback below, so a network retry of either can't double
	// post to VCP's stock ledger (see docs/architecture/inventory-stock-ledger-migration.md §13).
	const approvalIdempotencyKey = `INDENT-${id}-APPROVE-${crypto.randomUUID()}`;

	const { allocationResults } = await verifyIndentQuantityWithProductServices(
		req,
		modifiedIndentItems,
		true,
		approvalIdempotencyKey,
	);

	const allocationMap = new Map(allocationResults.map((i) => [i.product_id, i]));

	// --- Phase 3: persist in SCM — compensate VCP if this fails ---
	const transaction = await sequelize.transaction();
	try {
		for (const i of indent.IndentItems) {
			const allocation = allocationMap.get(i.product_id);
			const dryRun = dryRunMap.get(i.product_id);
			const issuedQty = allocation?.issued_qty || 0;
			const purchaseQty = dryRun?.qty_for_purchase_order || 0;

			await i.update(
				{
					qty_issued: issuedQty,
					qty_for_purchase_order: purchaseQty,
					minimum_stock_quantity: dryRun?.minimum_stock_quantity || 0,
					checkMinimumStock: dryRun?.checkMinimumStock || false,
					qty_updated_by_verifier: issuedQty,
					// Approval is terminal (see comment on rejectIndent below) — this is the one
					// point qty_for_purchase_order becomes binding, so it's also where the live
					// PO balance gets initialized to match it.
					qty_in_stock: dryRun?.total_available_quantity || 0,
					balance_indent_qty: purchaseQty,
				},
				{ transaction },
			);

			if (i.stock_type === 'serial' && allocation?.issuedSerials?.length > 0) {
				await IndentSerialRepository.update(
					{ is_issued: 1 },
					{
						where: { serial_no: { [Op.in]: allocation.issuedSerials } },
						transaction,
					},
				);
			}
		}

		const instance = await workflowEngine.advanceStage({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: id,
			action: 'approved',
			transaction,
		});

		await indent.update(
			{
				isVerified: true,
				verifiedBy: approvedBy,
				status: instance.status,
				approved_by: approvedBy,
				approved_at: new Date(),
			},
			{ transaction },
		);

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: id,
			action: 'approved',
			workflowStageName: stageNameBeforeAction,
			transaction,
		});

		await transaction.commit();
	} catch (scmError) {
		await transaction.rollback();
		logger.error('SCM DB update failed after VCP stock deduction — attempting rollback', { scmError });

		// Compensating transaction: restore stock in VCP. Reuses the same
		// idempotency key as the allocation it's reversing.
		try {
			await rollbackStockInProductService(req, allocationResults, approvalIdempotencyKey);
		} catch (rollbackError) {
			// Log prominently — manual intervention needed
			logger.error('CRITICAL: VCP rollback-stock failed. Stock deducted but indent NOT approved. Manual correction required.', {
				indent_id: id,
				allocationResults,
				rollbackError,
			});
		}

		throw scmError;
	}

	return fetchIndentForWorkflowAction(id);
};

/**
 * Shared by previewReissue and reissuePendingQuantity: fetches the approved indent and
 * its items still owed (balance_indent_qty > 0), and builds the request payload VCP's
 * verify-stock expects. For serial items, the stored serial_items still includes ones
 * already issued at approval time; VCP's verify-stock requires every serial it's handed
 * to currently be unsold (it throws if any aren't), so only the not-yet-issued serials
 * may be sent here.
 */
async function getPendingReissueItems(indentId) {
	const indent = await fetchIndentForWorkflowAction(indentId);

	if (indent.status !== 'approved') {
		throw new AppError(
			`Indent ${indentId} is not approved — nothing to re-issue`,
			StatusCodes.BAD_REQUEST,
		);
	}

	const pendingItems = (indent.IndentItems || []).filter(
		(i) => parseFloat(i.balance_indent_qty || 0) > 0,
	);

	// Request exactly what's still owed — VCP decides how much of that is actually available now.
	const plainPendingItems = pendingItems.map((i) => {
		const plain = i.get({ plain: true });
		if (plain.stock_type === 'serial') {
			plain.serial_items = (plain.serial_items || []).filter((s) => !s.is_issued);
		}
		return { ...plain, qty: parseFloat(i.balance_indent_qty) };
	});

	return { indent, pendingItems, plainPendingItems };
}

/**
 * Preview stage: dry-run only against VCP (no stock mutation) — lets the user see how
 * much of an already-approved indent's pending balance is actually available right now
 * before committing to a re-issue. Mirrors verifyIndent's advisory dry run.
 */
exports.previewReissue = async (req, indentId) => {
	const { pendingItems, plainPendingItems } = await getPendingReissueItems(indentId);
	if (pendingItems.length === 0) {
		return { indent_id: indentId, items: [] };
	}

	const { allocationResults } = await verifyIndentQuantityWithProductServices(
		req,
		plainPendingItems,
		false,
	);
	const allocationMap = new Map(allocationResults.map((a) => [a.product_id, a]));

	const items = pendingItems.map((item) => {
		const allocation = allocationMap.get(item.product_id);
		return {
			product_id: item.product_id,
			item_name: item.item_name,
			pending_qty: parseFloat(item.balance_indent_qty),
			available_now: parseFloat(allocation?.issued_qty || 0),
			still_short: parseFloat(allocation?.qty_for_purchase_order || 0),
		};
	});

	return { indent_id: indentId, items };
};

/**
 * Re-issue: balance_indent_qty is the qty that was approved as backorder but never issued
 * (it's separate from qty_for_purchase_order, which only tracks how much of that backorder
 * is still open for a PO — see purchase-order.service.js). Once stock for a short item shows
 * up later (typically after a PO is placed and received via GRN), this re-runs the same
 * verify/allocate call approveIndent uses, against whatever's still in balance_indent_qty,
 * and issues as much as VCP now has available. Safe to call repeatedly — an item with
 * nothing pending, or no stock yet, is just a no-op for that item. This is a deliberate,
 * user-initiated action (see previewReissue above) — not triggered automatically by GRN
 * creation, so cancelling a GRN can never leave a re-issue dangling against stock that's
 * no longer there.
 */
exports.reissuePendingQuantity = async (req, indentId) => {
	const { pendingItems, plainPendingItems } = await getPendingReissueItems(indentId);
	if (pendingItems.length === 0) {
		return { indent_id: indentId, reissued: [] };
	}

	const reissueIdempotencyKey = `INDENT-${indentId}-REISSUE-${crypto.randomUUID()}`;
	const { allocationResults } = await verifyIndentQuantityWithProductServices(
		req,
		plainPendingItems,
		true,
		reissueIdempotencyKey,
	);
	const allocationMap = new Map(allocationResults.map((a) => [a.product_id, a]));

	const transaction = await sequelize.transaction();
	const reissued = [];
	try {
		for (const item of pendingItems) {
			const allocation = allocationMap.get(item.product_id);
			const newlyIssued = parseFloat(allocation?.issued_qty || 0);
			if (newlyIssued <= 0) continue;

			const updatedBalance = parseFloat(item.balance_indent_qty) - newlyIssued;
			await item.update(
				{
					qty_issued: parseFloat(item.qty_issued || 0) + newlyIssued,
					balance_indent_qty: updatedBalance,
				},
				{ transaction },
			);

			if (item.stock_type === 'serial' && allocation?.issuedSerials?.length > 0) {
				await IndentSerialRepository.update(
					{ is_issued: 1 },
					{ where: { serial_no: { [Op.in]: allocation.issuedSerials } }, transaction },
				);
			}

			reissued.push({
				product_id: item.product_id,
				issued_qty: newlyIssued,
				balance_indent_qty: updatedBalance,
			});
		}

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: indentId,
			action: 'reissued',
			transaction,
		});

		await transaction.commit();
	} catch (scmError) {
		await transaction.rollback();
		logger.error('SCM DB update failed after VCP re-issue allocation — attempting rollback', { scmError });

		try {
			await rollbackStockInProductService(req, allocationResults, reissueIdempotencyKey);
		} catch (rollbackError) {
			logger.error('CRITICAL: VCP rollback-stock failed after re-issue. Stock deducted but indent NOT updated. Manual correction required.', {
				indent_id: indentId,
				allocationResults,
				rollbackError,
			});
		}

		throw scmError;
	}

	return { indent_id: indentId, reissued };
};

/**
 * Only reachable pre-allocation under the seeded verify->approve workflow (approval is
 * terminal), so no VCP compensation is ever needed here. A future workflow with stages
 * AFTER approval would need its own compensation before calling this, exactly like
 * cancelIndent does.
 */
exports.rejectIndent = async (req, id, remarks) => {
	return indentWorkflow.reject(req, id, remarks, {
		withinTransaction: async (indent, transaction) => {
			await indent.update(
				{
					status: 'rejected',
					rejected_by: actorSnapshot(req.user),
					rejected_at: new Date(),
					rejection_remarks: remarks,
				},
				{ transaction },
			);
		},
	});
};

/**
 * Soft-cancel, replacing hard delete for normal users. If the indent already passed the
 * approve stage (stock was allocated), rolls back via the exact same idempotent
 * rollbackStockInProductService call deleteIndent already uses.
 */
exports.cancelIndent = async (req, id, remarks) => {
	let allocationResults = [];
	let rollbackSucceeded = false;

	try {
		return await indentWorkflow.cancel(req, id, remarks, {
			beforeCancel: async (indent) => {
				if (indent.status === 'cancelled') {
					throw new AppError('This indent is already cancelled', StatusCodes.BAD_REQUEST);
				}

				if (indent.isVerified && Array.isArray(indent.IndentItems) && indent.IndentItems.length > 0) {
					allocationResults = indent.IndentItems
						.filter((item) => item.productSnapshot?.item_type !== 'service')
						.map((item) => ({
							product_id: item.product_id,
							organization_id: indent.org_id,
							indent_id: indent.id,
							stock_type: item.stock_type,
							base_issued_qty: item.qty_issued,
							batch_id: item.batch_id,
							issuedSerials: item.serial_items
								.filter((s) => s.is_issued)
								.map((s) => s.serial_no),
						}));

					if (allocationResults.length > 0) {
						await rollbackStockInProductService(req, allocationResults, `INDENT-${id}-CANCEL-${crypto.randomUUID()}`);
						rollbackSucceeded = true;
					}
				}
			},
			withinTransaction: async (indent, transaction) => {
				await indent.update(
					{
						status: 'cancelled',
						cancelled_by: actorSnapshot(req.user),
						cancelled_at: new Date(),
						cancellation_remarks: remarks,
					},
					{ transaction },
				);
			},
		});
	} catch (error) {
		// Only the "manual correction" framing applies once VCP stock has actually been
		// rolled back but the local persist afterward failed — not if the rollback call
		// itself (or an earlier precondition check) is what threw.
		if (rollbackSucceeded) {
			logger.error('SCM cancel persist failed after VCP stock rollback — manual correction may be required', {
				indentId: id,
				allocationResults,
				error,
			});
		}
		throw error;
	}
};

exports.getIndentById = async (req, id) => {
	return indentWorkflow.getById(req, id);
};

exports.getIndentWorkflow = async (req, id) => {
	return indentWorkflow.getWorkflow(req, id);
};

exports.reopenIndent = async (req, id, remarks) => {
	return indentWorkflow.reopen(req, id, remarks, {
		withinTransaction: async (indent, instance, transaction) => {
			await indent.update(
				{
					status: instance.status,
					rejected_by: null,
					rejected_at: null,
					rejection_remarks: null,
					cancelled_by: null,
					cancelled_at: null,
					cancellation_remarks: null,
				},
				{ transaction },
			);
		},
	});
};

exports.archiveIndent = async (req, id, remarks) => {
	return indentWorkflow.archive(req, id, remarks);
};

exports.restoreIndent = async (req, id, remarks) => {
	return indentWorkflow.restore(req, id, remarks);
};

exports.updateIndent = async (req, id, payload) => {
	const indent = await fetchIndentForWorkflowAction(id);

	const editable = await workflowEngine.isEditable({ documentType: DOCUMENT_TYPE, documentId: id });
	if (!editable) {
		throw new AppError('This indent can no longer be edited at its current workflow stage', StatusCodes.FORBIDDEN);
	}

	const before = indent.get({ plain: true });
	const { selectedIndents, item, unit, ...indentPayload } = payload;

	const transaction = await sequelize.transaction();
	try {
		await IndentRepository.updateById(
			id,
			{ ...indentPayload, ...(unit ? { unit_id: unit } : {}) },
			{ transaction },
		);

		// If editing a Rejected indent, restart the workflow per the definition's config
		// rather than leaving it stuck in a terminal state with stale stage history.
		const instanceInfo = await workflowEngine.getInstanceWithStages({ documentType: DOCUMENT_TYPE, documentId: id });
		if (instanceInfo.instance.status === 'rejected' && instanceInfo.definition?.restart_on_edit_after_rejection) {
			const restarted = await workflowEngine.restartInstance({
				req,
				documentType: DOCUMENT_TYPE,
				documentId: id,
				remarks: 'Resubmitted after edit',
				transaction,
			});
			await IndentRepository.updateById(id, { status: restarted.status, rejected_by: null, rejected_at: null, rejection_remarks: null }, { transaction });
		}

		await auditLogService.recordChange({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: id,
			action: 'update',
			before,
			after: { ...before, ...indentPayload },
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchIndentForWorkflowAction(id);
};

exports.deleteIndent = async (req, id) => {
	const indent = await IndentRepository.findById({
		where: { id },
		include: [
			{
				association: 'IndentItems',
				include: [
					{ model: IndentSerialItem, as: 'serial_items' },
				],
			},
		],
	});

	if (!indent) {
		throw new AppError(`Indent with ID ${id} not found`, StatusCodes.NOT_FOUND);
	}

	// If already verified, stock was deducted in VCP — roll it back first.
	// Service items never had stock deducted, so they're excluded here.
	if (indent.isVerified && Array.isArray(indent.IndentItems) && indent.IndentItems.length > 0) {
		const allocationResults = indent.IndentItems
			.filter((item) => item.productSnapshot?.item_type !== 'service')
			.map((item) => ({
				product_id: item.product_id,
				organization_id: indent.org_id,
				indent_id: indent.id,
				stock_type: item.stock_type,
				base_issued_qty: item.qty_issued,
				batch_id: item.batch_id,
				issuedSerials: item.serial_items
					.filter((s) => s.is_issued)
					.map((s) => s.serial_no),
			}));

		if (allocationResults.length > 0) {
			await rollbackStockInProductService(req, allocationResults, `INDENT-${id}-DELETE-${crypto.randomUUID()}`);
		}
	}

	// Permanent delete is restricted to Super Admin at the route layer and must be fully
	// logged — write the audit row BEFORE destroying so the deleted state is captured.
	await auditLogService.record({
		req,
		entityType: DOCUMENT_TYPE,
		entityId: id,
		action: 'delete',
		previousState: indent.get({ plain: true }),
	});

	await indent.destroy();
};

exports.checkProductQuantity = async (req, productId, uomId) => {
	const url = `${VCP_SERVICE_API_BASE_URL}${VCP_SERVICE_PRODUCT_ENDPOINT}`;
	const token = req.cookies.accessToken;
	console.log('token ', token);
	const response = await fetch(`${url}/${productId}`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});

	const { data } = await response.json();

	const ITEM_TYPE = data.item_type;
	const STOCK_TYPE = data.stock_type;

	// actualQuantity = 0;
	// if (ITEM_TYPE === 'product' && STOCK_TYPE === 'normal') {
	// 	actualQuantity = Number(data.available_qty);
	// } else if (ITEM_TYPE === 'product' && STOCK_TYPE === 'serial') {
	// 	actualQuantity = 0;
	// } else if (ITEM_TYPE === 'product' && STOCK_TYPE === 'batch') {
	// 	actualQuantity = data.batches.reduce(
	// 		(total, batch) => total + Number(batch.qty),
	// 		0,
	// 	);
	// 	console.log('data.batches ', data.batches);
	// 	console.log('actualQuantity, productId, uomId ', {actualQuantity, productId, uomId});
	// 	// const {deductedQtyInBase, uomUnit} = await getUOMConversion(token, actualQuantity, Number(productId), Number(uomId));
	// 	console.log('uomData ', {deductedQtyInBase, uomUnit});
	// 	actualQuantity = uomUnit * actualQuantity;
	// }

	return { ...data };
};

const getUOMConversion = async (token, qty, productId, selectedUOMId) => {
	const url = `${VCP_SERVICE_API_BASE_URL}${VCP_SERVICE_PRODUCT_ENDPOINT}`;
	const response = await fetch(
		`${url}/uom-conversion?qty=${qty}&product_id=${productId}&selected_uom_id=${selectedUOMId}`,
		{
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		},
	);

	const { data } = await response.json();
	console.log('getUOMConversion ', data);

	return data;
};

exports.lastIndentByBudgetId = async (req, budgetId) => {
	return IndentItemRepository.findOne(
		{ budget_id: budgetId },
		{
			include: [
				{
					model: Indent,
					as: 'indent',
				},
			],
			order: [['createdAt', 'DESC']],
		},
	);
};

/**
 * [2026-06-03] getConsumedBudgetByBudgetId
 *
 * WHY: The old endpoint (lastIndentByBudgetId) returned only the single most-recent
 * IndentItem for a budget. This meant the frontend had no way to know how much of
 * the current phase budget was already consumed by previously saved indents, so users
 * could keep creating indents beyond the phase limit indefinitely.
 *
 * Phases are isolated (Option A decided 2026-06-03): unspent budget from Phase 1 does
 * NOT carry forward to Phase 2. Each phase is enforced independently against its own
 * amount. Therefore consumed_amount only sums IndentItems whose createdAt falls within
 * the current phase's date window — items from earlier phases are excluded.
 */
exports.getConsumedBudgetByBudgetId = async (req, budgetId) => {
	const budget = await Budget.findByPk(budgetId);
	if (!budget) return null;

	// [2026-06-03] Use the date passed by the frontend (indent_date) so phase detection
	// matches the date the user selected, not the server's current time. This matters when
	// the indent_date is changed to test a different phase — without it the backend always
	// resolves the phase from new Date() and returns the wrong phase's consumed amount.
	const referenceDate = req.query.date ? new Date(req.query.date) : new Date();
	const phaseResult = getPhaseQuantityDateWise(budget, referenceDate);
	if (!phaseResult) return null;

	const { value: phase_amount, phaseDate, phasePeriod } = phaseResult;

	// [2026-06-03] Scope to current phase only — Phase-isolated rule.
	// startDate is null for Phase 1 (no lower bound), otherwise it's the previous phase's end date.
	const { startDate, endDate } = getPhaseRange(budget, phasePeriod);
	const createdAtFilter = startDate
		? { [Op.gt]: startDate, [Op.lte]: endDate }
		: { [Op.lte]: endDate };

	const existingItems = await IndentItem.findAll({
		where: { budget_id: budgetId, createdAt: createdAtFilter },
	});

	const consumed_amount = existingItems.reduce((sum, i) => sum + Number(i.amount || 0), 0);
	const consumed_qty = existingItems.reduce((sum, i) => sum + Number(i.qty || 0), 0);

	const available_amount =
		budget.budgetType === 'item-wise'
			? phase_amount - consumed_qty
			: phase_amount - consumed_amount;

	return {
		consumed_amount,
		consumed_qty,
		phase_amount,
		available_amount,
		phase_period: phasePeriod,
		phase_date: phaseDate,
	};
};

const getPhaseQuantityDateWise = (budget, date) => {
	if (!budget?.id) return 0;

	const currentTime = new Date(date).getTime();

	const phases = [
		{
			date: budget.first_phase_date,
			qty: budget.first_phase_qty,
		},
		{
			date: budget.second_phase_date,
			qty: budget.second_phase_qty,
		},
		{
			date: budget.third_phase_date,
			qty: budget.third_phase_qty,
		},
	];

	for (const [index, phase] of phases.entries()) {
		if (!phase.date) continue;

		const phaseEndOfDay = new Date(phase.date);
		phaseEndOfDay.setHours(23, 59, 59, 999);
		const phaseTime = phaseEndOfDay.getTime();

		if (currentTime <= phaseTime) {
			return {
				value: phase.qty ?? 0,
				phaseDate: phase.date,
				phasePeriod: index + 1,
			};
		}
	}

	return null;
};

/**
 * [2026-06-03] getPhaseRange — returns the start/end date boundary for a phase period.
 *
 * WHY: Phases are isolated (Option A). Unspent budget from Phase 1 does NOT roll into
 * Phase 2. To enforce this we must scope IndentItem queries to only the rows created
 * within the current phase's date window. Without this, consumed_amount would include
 * items from previous phases and incorrectly reduce the available budget for the
 * current phase.
 *
 * Phase boundaries (phasePeriod is 1-indexed):
 *   Phase 1 → no lower bound  … first_phase_date
 *   Phase 2 → first_phase_date … second_phase_date
 *   Phase 3 → second_phase_date … third_phase_date
 */
const getPhaseRange = (budget, phasePeriod) => {
	const phaseDates = [
		budget.first_phase_date,
		budget.second_phase_date,
		budget.third_phase_date,
	];
	const endDate = new Date(phaseDates[phasePeriod - 1]);
	endDate.setHours(23, 59, 59, 999);

	let startDate = null;
	if (phasePeriod > 1) {
		startDate = new Date(phaseDates[phasePeriod - 2]);
		startDate.setHours(23, 59, 59, 999);
	}

	return { startDate, endDate };
};

async function rollbackStockInProductService(req, allocationResults, idempotencyKey = null) {
	const URL = `${VCP_SERVICE_API_BASE_URL}${VCP_SERVICE_PRODUCT_ENDPOINT}/rollback-stock`;
	const token = req.cookies.accessToken;

	const response = await fetch(URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
			'x-s2s-comm-key': S2S_COMM_KEY,
		},
		body: JSON.stringify({ allocationResults, idempotencyKey }),
	});

	const data = await response.json();

	if (!response.ok) {
		throw new AppError(data?.message || 'Rollback stock API failed', response.status);
	}

	return data;
}

async function verifyIndentQuantityWithProductServices(
	req,
	selectedIndents,
	allocateQuantity = false,
	idempotencyKey = null,
) {
	const URL = `${VCP_SERVICE_API_BASE_URL}${VCP_SERVICE_PRODUCT_ENDPOINT}/verify-stock`;
	const token = req.cookies.accessToken;

	logger.info('verifyIndentQuantityWithProductServices URL', { URL, allocateQuantity });

	let response;
	try {
		response = await fetch(URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
				'x-s2s-comm-key': S2S_COMM_KEY,
			},
			body: JSON.stringify({ allocateQuantity, indents: selectedIndents, idempotencyKey }),
		});
	} catch (err) {
		throw new AppError(
			'Product service is currently unavailable. Please try again later.',
			503,
		);
	}

	let data;
	try {
		data = await response.json();
	} catch (_) {
		throw new AppError(
			`Verify stock API failed with HTTP ${response.status}: non-JSON response from ${URL}`,
			response.status,
		);
	}

	if (!response.ok) {
		logger.error('verifyIndentQuantityWithProductServices error response', { URL, status: response.status, data });
		throw new AppError(
			data?.message || `Verify stock API failed with HTTP ${response.status}`,
			response.status,
		);
	}

	return data;
}

/**
 * [2026-06-03] validateBudgetPhaseOnCreate — budget phase check at indent creation time.
 *
 * WHY: Frontend validation can be bypassed (commented out, direct API call, etc).
 * validateIndentBudgetAmount only runs at approval time, which is too late — by then the
 * indent is already saved and the approver must reject it. This function runs BEFORE any
 * DB record is written so the user gets an immediate error and nothing is persisted.
 *
 * Uses indent_date (not new Date()) for phase detection so the phase matches what the
 * frontend determined, not the server's clock at creation time.
 */
async function validateBudgetPhaseOnCreate(selectedIndents, indentDate, budgetType) {
	const budgetGroups = new Map();
	for (const item of selectedIndents) {
		const budgetId = item.budget_id;
		if (!budgetGroups.has(budgetId)) budgetGroups.set(budgetId, []);
		budgetGroups.get(budgetId).push(item);
	}

	for (const [budgetId, items] of budgetGroups) {
		const budget = await Budget.findByPk(budgetId);
		if (!budget) continue;

		const phaseResult = getPhaseQuantityDateWise(budget, indentDate);
		if (!phaseResult) continue;

		const { value: phaseAmount, phasePeriod } = phaseResult;

		// Scope consumed query to the current phase's date window (phase-isolated rule)
		const { startDate, endDate } = getPhaseRange(budget, phasePeriod);
		const createdAtFilter = startDate
			? { [Op.gt]: startDate, [Op.lte]: endDate }
			: { [Op.lte]: endDate };

		const previousItems = await IndentItem.findAll({
			where: { budget_id: budgetId, createdAt: createdAtFilter },
		});
		const previouslyConsumedAmount = previousItems.reduce(
			(sum, i) => sum + Number(i.amount || 0), 0,
		);
		const previouslyConsumedQty = previousItems.reduce(
			(sum, i) => sum + Number(i.qty || 0), 0,
		);

		const newAmount = items.reduce((sum, i) => sum + Number(i.total || 0), 0);
		const newQty = items.reduce((sum, i) => sum + Number(i.qty || 0), 0);

		const totalAmount = previouslyConsumedAmount + newAmount;
		const totalQty = previouslyConsumedQty + newQty;

		if (budgetType === 'value-wise') {
			if (phaseAmount > 0 && totalAmount > phaseAmount) {
				return `Budget ${budget.budget_id} Phase ${phasePeriod}: total amount ${totalAmount} (including ${previouslyConsumedAmount} already indented) exceeds phase limit of ${phaseAmount}. Available: ${phaseAmount - previouslyConsumedAmount}.`;
			}
		} else if (budgetType === 'item-wise') {
			if (phaseAmount > 0 && totalQty > phaseAmount) {
				return `Budget ${budget.budget_id} Phase ${phasePeriod}: total quantity ${totalQty} (including ${previouslyConsumedQty} already indented) exceeds phase quantity limit of ${phaseAmount}. Available: ${phaseAmount - previouslyConsumedQty}.`;
			}
			if (Number(budget.amount) > 0 && totalAmount > Number(budget.amount)) {
				return `Budget ${budget.budget_id}: total amount ${totalAmount} (including ${previouslyConsumedAmount} already indented) exceeds total budget amount of ${budget.amount}.`;
			}
		}
	}

	return null;
}

/**
 * [2026-06-03] validateIndentBudgetAmount — fixed cross-indent budget enforcement
 *
 * WHY (old bug): The original code only summed the items inside the indent currently
 * being approved. It never queried previously saved IndentItems for the same budget_id,
 * so a user could create unlimited indents against the same budget phase and each one
 * would pass validation individually even though the cumulative total exceeded the phase
 * limit.
 *
 * FIX: After computing the current indent's total, we query IndentItem for all OTHER
 * indents (indent_id != indent.id) on the same budget_id to get the previously consumed
 * amount, then validate the combined total against the phase limit.
 */
async function validateIndentBudgetAmount(indent, allocationMap) {
	const budgetGroups = new Map();
	for (const item of indent.IndentItems) {
		const budgetId = item.budget_id;
		if (!budgetGroups.has(budgetId)) {
			budgetGroups.set(budgetId, { budget: item.budget, items: [] });
		}
		budgetGroups.get(budgetId).items.push(item);
	}

	for (const [budgetId, { budget, items }] of budgetGroups) {
		if (!budget) continue;

		// Amount from the indent currently being approved
		const currentIndentAmount = items.reduce((total, item) => {
			const allocation = allocationMap.get(item.product_id);
			const issuedQty = allocation?.issued_qty ?? 0;
			const avgRate = Number(item.avg_rate) || 0;
			return total + avgRate * issuedQty;
		}, 0);

		const phaseResult = getPhaseQuantityDateWise(budget, indent.indent_date);
		if (!phaseResult) continue;

		const { value: phaseAmount, phaseDate, phasePeriod } = phaseResult;

		// [2026-06-03] Phase-isolated rule: only count items from OTHER indents that were
		// created within the same phase window as the indent being approved.
		// We exclude the current indent (indent_id != indent.id) to avoid double-counting
		// its items, which are already summed in currentIndentAmount above.
		const { startDate, endDate } = getPhaseRange(budget, phasePeriod);
		const createdAtFilter = startDate
			? { [Op.gt]: startDate, [Op.lte]: endDate }
			: { [Op.lte]: endDate };

		const previousItems = await IndentItem.findAll({
			where: {
				budget_id: budgetId,
				indent_id: { [Op.ne]: indent.id },
				createdAt: createdAtFilter,
			},
		});
		const previouslyConsumedAmount = previousItems.reduce(
			(sum, i) => sum + Number(i.amount || 0),
			0,
		);

		const totalIndentAmount = currentIndentAmount + previouslyConsumedAmount;

		logger.info('Budget validation', {
			budgetId,
			phaseAmount,
			currentIndentAmount,
			previouslyConsumedAmount,
			totalIndentAmount,
			phasePeriod,
			phaseDate,
		});

		if (totalIndentAmount > phaseAmount) {
			return `Total amount ${totalIndentAmount} for budget ${budget.budget_id} cannot be greater than the phase amount ${phaseAmount}. Previously consumed: ${previouslyConsumedAmount}, current indent: ${currentIndentAmount}.`;
		}
	}

	return null;
}
