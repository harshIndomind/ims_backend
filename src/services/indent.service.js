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
	indentItemQtyLogRepository,
	purchaseInvoiceItemsRepository,
} = require('../repository/index');
const { fetch } = require('undici');
const {
	Indent,
	Budget,
	CostCenter,
	IndentSerialItem,
	IndentItem,
	MasterUnit,
	IndentDocument,
	Department,
	MasterPeriod,
	MasterPlaceOfUse,
	IndentRemark,
	User,
	organization,
	Role,
	PurchaseOrder,
	WorkOrder,
	WorkOrderItem,
} = require('../models/index');
const AppError = require('../utils/AppError');
const { roundQty } = require('../utils/qty');
const { Op, literal } = require('sequelize');
const logger = require('../utils/logger');
const { StatusCodes } = require('http-status-codes');
const parseDate = require('../utils/parse-date');
const crypto = require('crypto');
const workflowEngine = require('./workflowEngine.service');
const auditLogService = require('./auditLog.service');
const indentQtyLogService = require('./indentQtyLog.service');
const { createWorkflowDocumentService } = require('./workflowDocument.factory');
const { generateInvoiceHTML, generateInvoiceHTMLPDF } = require('../pdf/htmlPdfGenerator');
const { getImageAsBase64DataUrl } = require('../utils/s3Bucket');
const dataVisibility = require('./dataVisibility.service');

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
			// Passing `transaction` here (not just running inside the outer try/catch) is what
			// actually matters for concurrency: it puts the Budget row lock + the "previously
			// consumed" read on the SAME DB transaction/connection as the writes below, so a
			// second concurrent createIndent against the same budget blocks on the row lock
			// instead of reading stale data via its own separate autocommit connection.
			const errorMessage = await validateBudgetPhaseOnCreate(
				selectedIndents,
				indentDate,
				indentPayload.budgetType,
				transaction,
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
				department_id: indentPayload.department_id || null,
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
						uom_id: Number(i.selected_uom_id) > 0 ? Number(i.selected_uom_id) : null,
						uom_name: i.selected_uom_unit || null,
						qty: i.qty,
						requested_qty: i.qty,
						avg_rate: i.price,
						discount: Number(i.discount) || 0,
						amount: i.total,
						issue_date: i.issue_date,
						days: i.days,
						specification: i.specification,
						stock_type: i.stock_type,
						productSnapshot: i || null,
						item_type: i?.productSnapshot?.item_type ?? i?.item_type ?? null,
						rate_contract_id: i.rate_contract_id || null,
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
		selectedItemTypeId,
		sortOrder,
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
	if (selectedBudgetTypeId && selectedBudgetTypeId != 'all') where.budgetType = selectedBudgetTypeId;

	if (indentNo) {
		where.indent_no = indentNo;
	} else if (fromDate && toDate) {
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

	// Role-based data visibility — applied AFTER query-param filters so that
	// non-admin users cannot bypass their department scope by sending an arbitrary
	// selectedDepartmentId in the query string.
	// super_admin / org_admin: no filter applied.
	// All other roles: restricts to the user's own department_id across all units.
	await dataVisibility.applyIndentVisibility(where, req.user);

	logger.debug("hasPurchaseQuantityIssue ", {hasPurchaseQuantityIssue});
	logger.debug("Get All Indents Where ", {where});
	
	const indentItemsWhere = {};
	// Service lines get a real qty_for_purchase_order too (set at approveIndent — see the
	// comment there), equal to the approved qty since nothing is ever "in stock" for a
	// service, so this filter now applies uniformly to product and service items alike.
	if (hasPurchaseQuantityIssue === 'true') {
		indentItemsWhere['qty_for_purchase_order'] = {
			[Op.gt]: 0,
		};
	}
	// Indents still owed qty once stock comes back in (post-PO/GRN re-issue queue) —
	// independent of qty_for_purchase_order, which only tracks open-PO balance.
	if (hasPendingReissueQty === 'true') {
		indentItemsWhere['balance_indent_qty'] = {
			[Op.gt]: 0,
		};
	}
	if (budgetId > 0) {
		indentItemsWhere['budget_id'] = budgetId;
	}
	if (selectedItemTypeId && selectedItemTypeId !== 'all') {
		indentItemsWhere['item_type'] = selectedItemTypeId;
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
				required: Object.keys(indentItemsWhere).length > 0,
				include: [
					{
						model: Budget,
						as: 'budget',
						attributes: ['budget_id'],
						include: [
							{
								model: CostCenter,
								as: 'cost_center',
								attributes: ['id', 'name', 'code'],
							},
						],
					},
					{
						model: IndentSerialItem,
						as: 'serial_items',
						attributes: ['serial_no', 'is_issued', 'issued_via', 'issued_at'],
					},
				],
			},
			{
				model: MasterUnit,
				as: 'unit',
				attributes: ['id', 'unitName', 'unitCd']
			}
		],
		order: [['createdAt', sortOrder === 'asc' ? 'ASC' : 'DESC']],
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

	// Batched once across every service item on this page, not per-indent — see
	// attachPendingReissueForServiceItems's own comment for why this is a new field
	// rather than overwriting balance_indent_qty.
	await attachPendingReissueForServiceItems(
		result.rows.flatMap((indent) => indent.IndentItems || []),
	);

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
			// Plain objects, not raw Sequelize instances — matches verifyIndent/approveIndent's
			// plainIndentItems pattern elsewhere in this file, and keeps the cross-service
			// payload to VCP lean instead of serializing full model/association metadata.
			const plainItems = indent.IndentItems.map((i) => i.get({ plain: true }));
			console.log('indent.IndentItems ', plainItems);

			const { allocationResults } =
				await verifyIndentQuantityWithProductServices(req, plainItems);

			// VCP's allocationResults only carry a bare uom_id (and only for some
			// stock types) — the human-readable label lives on IndentItem itself
			// (uom_name, denormalized at indent-creation time), so merge it back
			// in here for the verify/approve modal to display.
			const uomByItemId = new Map(
				plainItems.map((i) => [i.id, { uom_id: i.uom_id, uom_name: i.uom_name }]),
			);
			verifiedQuantities = (allocationResults ?? []).map((r) => ({
				...r,
				uom_id: r.uom_id ?? uomByItemId.get(r.indent_item_id)?.uom_id ?? null,
				uom_name: uomByItemId.get(r.indent_item_id)?.uom_name ?? null,
			}));

			console.log('Verify Indent Quantity Response ', allocationResults);
		}
	}

	return verifiedQuantities;
};

// qty_issued/qty_updated_by_verifier ("Actual Issue"/"Qty For Issue") and balance_indent_qty
// ("Pending Re-issue") are all set once at approveIndent and never touched again for service
// items — because VCP has no stock concept for services, it always reports them as instantly
// "fully issued", so those columns permanently show the full requested qty even though nothing
// has actually been delivered yet. That's misleading and internally inconsistent (an indent
// showing "Actual Issue: 10" while a Work Order for the same line is still open makes no
// sense). For services, "actually issued" only has a real meaning once a Purchase Invoice
// confirms what the vendor/contractor actually delivered against a Work Order raised for that
// line — the same "actual delivered" signal Short Close's remaining-qty formula already uses
// for QC-bypassed WOs (qc-inspection.service.js / short-close.service.js).
//
// So for service items, both figures are computed live and attached as NEW fields —
// `actual_delivered_qty` (what "Actual Issue"/"Qty For Issue" should show) and
// `pending_reissue_qty` (`qty` minus that) — never overwriting the real qty_issued/
// qty_updated_by_verifier/balance_indent_qty columns, so callers that mutate those for real
// (approveIndent, reissuePendingQuantity, the hasPendingReissueQty filter) are unaffected.
//
// Batched (not one query per item) since this runs both for a single indent's detail view and
// for every service item across a whole page of the indent list.
async function attachPendingReissueForServiceItems(items) {
	const serviceItems = items.filter(
		(i) => (i.item_type ?? i.get?.('item_type')) === 'service',
	);
	if (!serviceItems.length) return;

	const indentIds = [...new Set(serviceItems.map((i) => i.indent_id))];
	const productIds = [...new Set(serviceItems.map((i) => i.product_id))];

	const woItems = await WorkOrderItem.findAll({
		attributes: ['id', 'product_id'],
		where: { product_id: { [Op.in]: productIds } },
		include: [
			{
				model: WorkOrder,
				as: 'workOrder',
				attributes: ['indent_id'],
				required: true,
				where: { indent_id: { [Op.in]: indentIds } },
			},
		],
	});

	const invoicedByWoItem = await purchaseInvoiceItemsRepository.sumInvoicedQtyForPoWoItems(
		woItems.map((w) => w.id),
	);

	const invoicedByIndentProduct = new Map();
	for (const w of woItems) {
		const key = `${w.workOrder.indent_id}:${w.product_id}`;
		const invoiced = invoicedByWoItem.get(w.id) || 0;
		invoicedByIndentProduct.set(key, (invoicedByIndentProduct.get(key) || 0) + invoiced);
	}

	for (const item of serviceItems) {
		const key = `${item.indent_id}:${item.product_id}`;
		const delivered = roundQty(invoicedByIndentProduct.get(key) || 0);
		const requestedQty = parseFloat(item.qty || 0);
		const pending = roundQty(Math.max(0, requestedQty - delivered));
		const target = item.dataValues || item;
		target.actual_delivered_qty = delivered;
		target.pending_reissue_qty = pending;
	}
}

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
			{
				model: IndentDocument,
				as: 'IndentDocuments',
				attributes: ['id', 'file_name', 'file_key', 'file_type', 'file_size', 'storage_type', 'uploaded_by', 'createdAt'],
			},
		],
	});
	if (!indent) {
		throw new AppError(`Indent with ID ${id} not found`, StatusCodes.NOT_FOUND);
	}
	await attachPendingReissueForServiceItems(indent.IndentItems || []);
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

exports.approveIndent = async (req, id, items, lastDate) => {
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
		// Re-validate under a row lock, inside the transaction that's about to persist this
		// approval. The Phase-1 check above (line ~663) is only advisory — it runs before the
		// VCP allocation call and takes no lock, so two concurrent approvals against indents
		// sharing a budget could both pass it and then both commit here. Locking the budget row
		// now, immediately before writing, is what actually prevents that race; if this trips,
		// the catch below compensates the VCP allocation exactly as it would for any other
		// failure in this block.
		if (indent.budgetType === 'value-wise') {
			const errorMessage = await validateIndentBudgetAmount(indent, allocationMap, transaction);
			if (errorMessage) {
				throw new AppError(errorMessage, StatusCodes.BAD_REQUEST);
			}
		}

		for (const i of indent.IndentItems) {
			const allocation = allocationMap.get(i.product_id);
			const dryRun = dryRunMap.get(i.product_id);
			const issuedQty = roundQty(allocation?.issued_qty || 0);
			const baseIssuedQty = allocation?.base_issued_qty ?? issuedQty;
			// Services never carry stock, so VCP always reports them as fully issued
			// (backorder 0) — that's correct for "issued" but wrong for "what's still
			// open for a Work Order": nothing is ever in stock for a service, so the
			// WO ceiling should be the full approved qty, not the (always-zero) product
			// backorder formula. balance_indent_qty stays 0 for services regardless —
			// that counter is GRN/stock-return-specific (Reissue Pending Quantity) and
			// has no equivalent for labor; Short Close is the release mechanism there.
			const isService = i.item_type === 'service';
			const purchaseQty = isService
				? issuedQty
				: roundQty(Math.max(0, parseFloat(i.qty || 0) - issuedQty));
			const balanceIndentQty = isService ? 0 : purchaseQty;
			const previousQtyForPurchaseOrder = parseFloat(i.qty_for_purchase_order || 0);
			const previousBalanceIndentQty = parseFloat(i.balance_indent_qty || 0);

			await i.update(
				{
					qty_issued: issuedQty,
					base_qty_issued: baseIssuedQty,
					qty_for_purchase_order: purchaseQty,
					minimum_stock_quantity: dryRun?.minimum_stock_quantity || 0,
					checkMinimumStock: dryRun?.checkMinimumStock || false,
					qty_updated_by_verifier: issuedQty,
					// Approval is terminal (see comment on rejectIndent below) — this is the one
					// point qty_for_purchase_order becomes binding, so it's also where the live
					// PO balance gets initialized to match it.
					qty_in_stock: dryRun?.total_available_quantity || 0,
					balance_indent_qty: balanceIndentQty,
				},
				{ transaction },
			);

			await indentQtyLogService.record({
				req,
				indentItemId: i.id,
				indentId: id,
				productId: i.product_id,
				field: 'qty_for_purchase_order',
				delta: purchaseQty - previousQtyForPurchaseOrder,
				previousValue: previousQtyForPurchaseOrder,
				newValue: purchaseQty,
				source: 'indent_approved',
				transaction,
			});
			await indentQtyLogService.record({
				req,
				indentItemId: i.id,
				indentId: id,
				productId: i.product_id,
				field: 'balance_indent_qty',
				delta: balanceIndentQty - previousBalanceIndentQty,
				previousValue: previousBalanceIndentQty,
				newValue: balanceIndentQty,
				source: 'indent_approved',
				transaction,
			});

			if (i.stock_type === 'serial') {
				await markIndentSerialsIssued(i, allocation?.issuedSerials, 'approval', transaction);
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
				last_date: lastDate || new Date(),
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
 * Marks the serials VCP actually issued against one indent line. VCP may top up with
 * serials the requester never selected (e.g. ones received on an MRN after the indent was
 * raised), which have no IndentSerialItem row yet — create those so the line still
 * records exactly which serials were handed over. Scoped to the line, since the same
 * serial_no can appear on other indents' selections.
 */
async function markIndentSerialsIssued(item, issuedSerials, issuedVia, transaction) {
	if (!issuedSerials?.length) return;
	const issuedAt = new Date();
	await IndentSerialItem.update(
		{ is_issued: 1, issued_via: issuedVia, issued_at: issuedAt },
		{ where: { indent_item_id: item.id, serial_no: { [Op.in]: issuedSerials } }, transaction },
	);
	const existing = await IndentSerialItem.findAll({
		where: { indent_item_id: item.id, serial_no: { [Op.in]: issuedSerials } },
		attributes: ['serial_no'],
		transaction,
	});
	const existingSet = new Set(existing.map((s) => s.serial_no));
	const missing = issuedSerials.filter((serialNo) => !existingSet.has(serialNo));
	if (missing.length > 0) {
		await IndentSerialItem.bulkCreate(
			missing.map((serialNo) => ({
				indent_item_id: item.id,
				product_id: item.product_id,
				serial_no: serialNo,
				is_issued: 1,
				issued_via: issuedVia,
				issued_at: issuedAt,
			})),
			{ transaction },
		);
	}
}

/**
 * A batch-type IndentItem's `batch_id` is pinned to whichever batch was selected (FEFO
 * suggestion, user-editable) at indent-creation time. verify-stock only ever checks that
 * one batch's qty — so if that batch was empty (hence the backorder) and stock later
 * arrives in a *different*, newly-received batch, the pinned batch_id never sees it and
 * re-issue keeps reporting 0 available forever. Re-resolve to whichever current batch has
 * stock, FEFO order (soonest expiry first, undated last), same policy as the frontend's
 * indent-creation suggestion — see docs/architecture/vcp-batch-fifo-fefo-design.
 */
async function resolveCurrentBatchIdForReissue(req, productId) {
	const url = `${VCP_SERVICE_API_BASE_URL}${VCP_SERVICE_PRODUCT_ENDPOINT}/${productId}`;
	const token = req.cookies.accessToken;
	const response = await fetch(url, {
		method: 'GET',
		// VCP's verifyToken reads req.cookies.accessToken, not the Authorization header —
		// this is a server-to-server fetch so no cookie jar carries it automatically.
		headers: { Authorization: `Bearer ${token}`, Cookie: `accessToken=${token}` },
	});
	if (!response.ok) {
		logger.warn('resolveCurrentBatchIdForReissue: product fetch failed', {
			productId,
			status: response.status,
		});
		return null;
	}

	const { data } = await response.json();
	const batches = (data?.batches || []).filter((b) => parseFloat(b.qty || 0) > 0);
	logger.info('resolveCurrentBatchIdForReissue', {
		productId,
		allBatches: (data?.batches || []).map((b) => ({ id: b.id, qty: b.qty, expiry_date: b.expiry_date })),
		batchesWithStock: batches.map((b) => b.id),
	});
	if (batches.length === 0) return null;

	batches.sort((a, b) => {
		const aTime = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
		const bTime = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
		return aTime - bTime;
	});
	return batches[0].id;
}

/**
 * Shared by previewReissue and reissuePendingQuantity: fetches the approved indent and
 * its items still owed (balance_indent_qty > 0), and builds the request payload VCP's
 * verify-stock expects. For serial items, the stored serial_items still includes ones
 * already issued at approval time; VCP's verify-stock requires every serial it's handed
 * to currently be unsold (it throws if any aren't), so only the not-yet-issued serials
 * may be sent here. For batch items, batch_id is re-resolved to whatever currently has
 * stock (see resolveCurrentBatchIdForReissue) instead of the stale batch_id captured at
 * indent creation.
 */
async function getPendingReissueItems(req, indentId) {
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
	const plainPendingItems = await Promise.all(
		pendingItems.map(async (i) => {
			const plain = i.get({ plain: true });
			if (plain.stock_type === 'serial') {
				plain.serial_items = (plain.serial_items || []).filter((s) => !s.is_issued);
			}
			if (plain.stock_type === 'batch') {
				const originalBatchId = plain.batch_id;
				const currentBatchId = await resolveCurrentBatchIdForReissue(req, plain.product_id);
				if (currentBatchId != null) plain.batch_id = currentBatchId;
				logger.info('getPendingReissueItems: batch resolution', {
					product_id: plain.product_id,
					originalBatchId,
					resolvedBatchId: currentBatchId,
					finalBatchId: plain.batch_id,
				});
			}
			return { ...plain, qty: parseFloat(i.balance_indent_qty) };
		}),
	);

	return { indent, pendingItems, plainPendingItems };
}

/**
 * Preview stage: dry-run only against VCP (no stock mutation) — lets the user see how
 * much of an already-approved indent's pending balance is actually available right now
 * before committing to a re-issue. Mirrors verifyIndent's advisory dry run.
 */
exports.previewReissue = async (req, indentId) => {
	const { pendingItems, plainPendingItems } = await getPendingReissueItems(req, indentId);
	if (pendingItems.length === 0) {
		return { indent_id: indentId, items: [] };
	}
	const { allocationResults } = await verifyIndentQuantityWithProductServices(
		req,
		plainPendingItems,
		false,
	);
	// Keyed by indent_item_id, not product_id — an indent can carry two lines for the same
	// product in different UOMs (e.g. one CTN line, one PCS line), and keying by product_id
	// let the second line's allocation silently overwrite the first's in the map.
	const allocationMap = new Map(allocationResults.map((a) => [a.indent_item_id, a]));

	const items = pendingItems.map((item) => {
		const allocation = allocationMap.get(item.id);
		return {
			indent_item_id: item.id,
			product_id: item.product_id,
			item_name: item.item_name,
			uom_name: item.uom_name,
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
 *
 * `allocations` is the caller's per-item choice of how much to re-issue and to which
 * contractor/work order it's being handed over — [{ indent_item_id, qty, vendor_id,
 * work_order_id }]. Only items named here are touched; anything left out keeps its
 * balance_indent_qty untouched for a later re-issue against a different contractor/WO.
 * `qty` may be less than the item's full balance (a partial hand-over) but never more —
 * and however much VCP actually manages to allocate (which can be less than requested,
 * same as the no-allocations behavior this replaced) is what gets logged against that
 * vendor/work order.
 */
exports.reissuePendingQuantity = async (req, indentId, allocations) => {
	if (!Array.isArray(allocations) || allocations.length === 0) {
		throw new AppError(
			'Select at least one item with a quantity, contractor and work order to re-issue',
			StatusCodes.BAD_REQUEST,
		);
	}

	const allocationMap = new Map();
	for (const a of allocations) {
		const itemId = parseInt(a.indent_item_id, 10);
		const qty = parseFloat(a.qty);
		// Contractor and work order are both optional — but a work order is meaningless without
		// knowing which contractor it's for, so picking a contractor forces a work order too.
		const vendorId = a.vendor_id != null && a.vendor_id !== '' ? parseInt(a.vendor_id, 10) : null;
		// Arbitrary VCP vendor fields (name, code, gstin, ...) captured at reissue time — kept as
		// a single JSON blob so a new field never needs another migration. Just display data, not
		// used for any authorization/business logic, so it's stored as-given.
		const vendorSnapshot =
			a.vendor_snapshot && typeof a.vendor_snapshot === 'object' && !Array.isArray(a.vendor_snapshot)
				? a.vendor_snapshot
				: null;
		const workOrderId = a.work_order_id != null && a.work_order_id !== '' ? parseInt(a.work_order_id, 10) : null;
		if (!itemId || !(qty > 0)) {
			throw new AppError(
				'Each re-issue allocation needs an item and a quantity greater than 0',
				StatusCodes.BAD_REQUEST,
			);
		}
		if (vendorId && !workOrderId) {
			throw new AppError(
				'Select a work order for the item assigned to a contractor',
				StatusCodes.BAD_REQUEST,
			);
		}
		allocationMap.set(itemId, { qty, vendorId, vendorSnapshot, workOrderId });
	}

	const { pendingItems: allPendingItems, plainPendingItems: allPlainPendingItems } =
		await getPendingReissueItems(req, indentId);
	if (allPendingItems.length === 0) {
		return { indent_id: indentId, reissued: [] };
	}

	const pendingItemsById = new Map(allPendingItems.map((item) => [item.id, item]));
	const pendingItems = allPendingItems.filter((item) => allocationMap.has(item.id));
	if (pendingItems.length === 0) {
		throw new AppError(
			'None of the selected items currently have a pending balance to re-issue',
			StatusCodes.BAD_REQUEST,
		);
	}

	// Work orders must belong to this indent — guards against a stale/foreign id slipping
	// through from the client. Optional, so only checked where one was actually given.
	const workOrderIds = [...new Set([...allocationMap.values()].map((a) => a.workOrderId).filter(Boolean))];
	if (workOrderIds.length > 0) {
		const validWorkOrders = await WorkOrder.findAll({
			where: { id: { [Op.in]: workOrderIds }, indent_id: indentId },
			attributes: ['id'],
		});
		const validWorkOrderIds = new Set(validWorkOrders.map((wo) => wo.id));
		for (const allocation of allocationMap.values()) {
			if (allocation.workOrderId && !validWorkOrderIds.has(allocation.workOrderId)) {
				throw new AppError(
					`Work order ${allocation.workOrderId} does not belong to this indent`,
					StatusCodes.BAD_REQUEST,
				);
			}
		}
	}

	const plainPendingItems = allPlainPendingItems
		.filter((plain) => allocationMap.has(plain.id))
		.map((plain) => {
			const allocation = allocationMap.get(plain.id);
			const balance = parseFloat(pendingItemsById.get(plain.id).balance_indent_qty);
			if (allocation.qty > balance + 1e-6) {
				throw new AppError(
					`Requested qty for item ${plain.id} exceeds its pending balance (${balance})`,
					StatusCodes.BAD_REQUEST,
				);
			}
			return { ...plain, qty: allocation.qty };
		});

	const reissueIdempotencyKey = `INDENT-${indentId}-REISSUE-${crypto.randomUUID()}`;
	const { allocationResults } = await verifyIndentQuantityWithProductServices(
		req,
		plainPendingItems,
		true,
		reissueIdempotencyKey,
	);
	// See previewReissue's comment above — must key by indent_item_id, not product_id, or a
	// second line for the same product overwrites the first's allocation in this map.
	const resultMap = new Map(allocationResults.map((a) => [a.indent_item_id, a]));

	const transaction = await sequelize.transaction();
	const reissued = [];
	try {
		for (const item of pendingItems) {
			const allocation = resultMap.get(item.id);
			const newlyIssued = roundQty(allocation?.issued_qty || 0);
			if (newlyIssued <= 0) continue;

			const requested = allocationMap.get(item.id);
			const newlyIssuedBase = parseFloat(allocation?.base_issued_qty ?? allocation?.issued_qty ?? 0);
			const previousBalance = parseFloat(item.balance_indent_qty);
			const updatedBalance = roundQty(previousBalance - newlyIssued);
			await item.update(
				{
					qty_issued: roundQty(parseFloat(item.qty_issued || 0) + newlyIssued),
					base_qty_issued: parseFloat(item.base_qty_issued || 0) + newlyIssuedBase,
					balance_indent_qty: updatedBalance,
					qty_updated_by_verifier: roundQty(parseFloat(item.qty_updated_by_verifier || 0) + newlyIssued),
					// Keep the item's batch_id in sync with whichever batch this re-issue actually
					// drew from (resolveCurrentBatchIdForReissue may have picked a different, newer
					// batch than the one recorded at indent creation).
					...(item.stock_type === 'batch' && allocation?.batch_id != null
						? { batch_id: allocation.batch_id }
						: {}),
				},
				{ transaction },
			);

			if (item.stock_type === 'serial') {
				await markIndentSerialsIssued(item, allocation?.issuedSerials, 'reissue', transaction);
			}

			await indentQtyLogService.record({
				req,
				indentItemId: item.id,
				indentId,
				productId: item.product_id,
				field: 'balance_indent_qty',
				delta: -newlyIssued,
				previousValue: previousBalance,
				newValue: updatedBalance,
				source: 'reissued',
				vendorId: requested.vendorId,
				vendorSnapshot: requested.vendorSnapshot,
				workOrderId: requested.workOrderId,
				transaction,
			});

			reissued.push({
				indent_item_id: item.id,
				product_id: item.product_id,
				issued_qty: newlyIssued,
				balance_indent_qty: updatedBalance,
				vendor_id: requested.vendorId,
				vendor_snapshot: requested.vendorSnapshot,
				work_order_id: requested.workOrderId,
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
							// base_qty_issued holds base-UOM qty (set at approval/re-issue).
							// qty_issued is in selected UOM — wrong for VCP rollback-stock.
							base_issued_qty: item.base_qty_issued ?? item.qty_issued,
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

/**
 * Print-preview HTML for an Indent, mirroring purchase-order.service.js /
 * work-order.service.js's generateInvoiceHtml — but showing requested vs. issued vs.
 * balance_indent_qty (pending re-issue) per item, plus the indent_item_qty_log history of
 * `reissued` events (see indentQtyLog.service.js), since an Indent has no vendor/tax data
 * of its own to print.
 */
exports.generateInvoiceHtml = async (req) => {
	const { id } = req.params;

	const indent = await IndentRepository.findById({
		where: { id },
		include: [
			{ model: MasterUnit, as: 'unit' },
			{ model: Department, as: 'department' },
			{ model: MasterPeriod, as: 'period' },
			{ model: MasterPlaceOfUse, as: 'placeOfUse' },
			{ model: IndentRemark, as: 'remark' },
			{
				model: IndentItem,
				as: 'IndentItems',
				include: [
					{ model: Budget, as: 'budget' },
					{
						model: IndentSerialItem,
						as: 'serial_items',
						attributes: ['serial_no', 'is_issued', 'issued_via', 'issued_at'],
					},
				],
			},
		],
	});

	if (!indent) throw new AppError('Indent not found', StatusCodes.NOT_FOUND);

	// findByIndentIds spreads `options` over its default `where`, replacing it rather than
	// merging, so indent_id must be included here alongside the extra filters. WorkOrder is
	// joined for its doc number — vendor has no local table (cross-service VCP id), so its
	// display fields are a snapshot on `vendor_snapshot` (JSON) captured at reissue time instead.
	const qtyLogs = await indentItemQtyLogRepository.findByIndentIds([id], {
		where: { indent_id: id, field: 'balance_indent_qty', source: 'reissued' },
		include: [
			{
				model: WorkOrder,
				as: 'workOrder',
				attributes: ['id', 'doc_number', 'woPrefix', 'woNo', 'woPostfix'],
			},
		],
	});

	const response = await calculateIndentInvoice(indent, qtyLogs);

	const html = await generateInvoiceHTML({ ...response, copyTitle: 'INDENT COPY' }, 'indentTemplate');
	return `<div class="preview-page">\n${html}\n</div>`;
};

exports.downloadInvoicePdf = async (req) => {
	const { html = '' } = req.body;
	const pdfPath = await generateInvoiceHTMLPDF(html, 'indentTemplate', { multi: true });
	return pdfPath;
};

function workOrderNumber(wo) {
	if (!wo) return null;
	return wo.doc_number || `${wo.woPrefix || ''}${wo.woNo || ''}${wo.woPostfix || ''}` || null;
}

async function calculateIndentInvoice(indent, qtyLogs) {
	const invoiceData = indent.get({ plain: true });

	const itemById = new Map(
		(invoiceData.IndentItems || []).map((item) => [item.id, item]),
	);

	// Logo lives on the org-admin user, not on MasterUnit, so userData must be fetched
	// regardless of which branch supplies `business` below — the original version only
	// looked it up in the no-unit fallback branch, which meant the logo never rendered for
	// the (near-universal) case of an indent with a unit_id set.
	let businessLogo = null;
	let business = null;
	const unit = invoiceData.unit;

	const orgRole = await Role.findOne({ where: { code: 'org_admin' }, attributes: ['id'] });
	const userData = await User.findOne({
		where: { org_id: invoiceData.org_id },
		include: [
			{ model: organization, as: 'organization' },
			{
				model: Role,
				as: 'userRoles',
				through: { attributes: [] },
				attributes: ['id', 'name', 'code'],
				where: orgRole?.id,
			},
		],
	});
	if (userData?.logo) {
		businessLogo = await getImageAsBase64DataUrl(userData.logo);
	}

	if (unit) {
		business = {
			org_name: unit.unit_name || unit.unitName || '',
			city: unit.city,
			pincode: unit.pincode,
			org_gst_number: unit.gstin,
			org_email: unit.company_email,
		};
		const unitAddressLine = [unit.address1, unit.address2, unit.landmark].filter(Boolean).join(', ');
		business.address = `${unitAddressLine ? `${unitAddressLine},<br>` : ''}
			${unit.city || ''} - ${unit.pincode || ''}, ${unit.state || ''}<br>`;
	} else if (userData) {
		business = userData.organization;
		business.address = `${business.org_address || ''},<br>
			${business.city || ''} - ${business.pincode || ''}, ${business?._state?.state_name || ''}<br>`;
	}

	// One log row per reissue event, in ascending createdAt order (indentItemQtyLogRepository's
	// default order) — so the last one written per item, kept here, is the most recent reissue.
	// Used to show each item's current contractor/work order on the main table; the full
	// per-event breakdown (an item can be reissued to different contractors over time) is in
	// reissueHistory below.
	const latestReissueByItem = new Map();
	for (const log of qtyLogs || []) {
		const plain = log.get ? log.get({ plain: true }) : log;
		latestReissueByItem.set(plain.indent_item_id, plain);
	}

	const productItems = (invoiceData.IndentItems || []).map((item) => {
		const requestedQty = parseFloat(item.qty || 0);
		const issuedQty = parseFloat(item.qty_issued || 0);
		const pendingQty = parseFloat(item.balance_indent_qty || 0);
		const qtyForPurchaseOrder = parseFloat(item.qty_for_purchase_order || 0);

		let statusLabel;
		if (pendingQty > 0) {
			statusLabel = 'Pending Re-issue';
		} else if (requestedQty > 0 && issuedQty >= requestedQty) {
			statusLabel = 'Fully Issued';
		} else if (issuedQty > 0) {
			statusLabel = 'Partially Issued';
		} else {
			statusLabel = 'Open';
		}

		const latestReissue = latestReissueByItem.get(item.id);

		// Serials issued at approval vs. handed over later by a re-issue. Rows issued before
		// issued_via existed have it NULL and are counted as issued at approval.
		const issuedSerialItems = (item.serial_items || [])
			.filter((serial) => serial.is_issued)
			.sort((a, b) => a.serial_no.localeCompare(b.serial_no, undefined, { numeric: true }));
		const reissuedSerials = issuedSerialItems
			.filter((serial) => serial.issued_via === 'reissue')
			.map((serial) => serial.serial_no);
		const issuedSerials = issuedSerialItems
			.filter((serial) => serial.issued_via !== 'reissue')
			.map((serial) => serial.serial_no);

		return {
			...item,
			requestedQty,
			issuedQty,
			pendingQty,
			qtyForPurchaseOrder,
			statusLabel,
			contractorName: latestReissue?.vendor_snapshot?.name || null,
			contractorCode: latestReissue?.vendor_snapshot?.code || null,
			workOrderNo: workOrderNumber(latestReissue?.workOrder),
			issuedSerials,
			reissuedSerials,
		};
	});

	const reissueHistory = (qtyLogs || []).map((log) => {
		const plain = log.get ? log.get({ plain: true }) : log;
		const sourceItem = itemById.get(plain.indent_item_id);
		return {
			...plain,
			item_name: sourceItem?.item_name || `Item #${plain.indent_item_id}`,
			uom_name: sourceItem?.uom_name || '',
			issued_qty: Math.abs(parseFloat(plain.delta || 0)),
			workOrderNo: workOrderNumber(plain.workOrder),
		};
	});

	return {
		...invoiceData,
		businessLogo,
		business,
		combineInvoiceNumber: invoiceData.indent_no || `IND-${invoiceData.id}`,
		indentDate: formatIndentDate(invoiceData.indent_date),
		lastDate: formatIndentDate(invoiceData.last_date),
		productItems,
		reissueHistory,
		totalRequestedQty: productItems.reduce((sum, item) => sum + item.requestedQty, 0),
		totalIssuedQty: productItems.reduce((sum, item) => sum + item.issuedQty, 0),
		totalPendingQty: productItems.reduce((sum, item) => sum + item.pendingQty, 0),
		pendingReissueItemCount: productItems.filter((item) => item.pendingQty > 0).length,
	};
}

function formatIndentDate(val) {
	if (!val) return '';
	try {
		return new Date(val).toLocaleDateString('en-IN', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
		});
	} catch {
		return '';
	}
}

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

	if (selectedIndents !== undefined && (!Array.isArray(selectedIndents) || selectedIndents.length === 0)) {
		throw new AppError('At least one item is required to update an indent.', StatusCodes.BAD_REQUEST);
	}

	const transaction = await sequelize.transaction();
	try {
		// [budget-validation] Editing an indent's items can raise its total consumption
		// against a budget just as easily as creating a new indent can — createIndent's
		// fail-fast check was never mirrored here, so an over-budget indent could always be
		// smuggled in by first saving a small one and then editing it up. Re-run the same
		// phase check here, excluding this indent's own pre-edit rows (they're about to be
		// destroyed and replaced below, not added on top of).
		if (Array.isArray(selectedIndents) && selectedIndents.length > 0) {
			const indentDate = indentPayload.indent_date
				? new Date(indentPayload.indent_date)
				: indent.indent_date;
			const budgetType = indentPayload.budgetType ?? indent.budgetType;
			const errorMessage = await validateBudgetPhaseOnCreate(
				selectedIndents,
				indentDate,
				budgetType,
				transaction,
				id,
			);
			if (errorMessage) {
				throw new AppError(errorMessage, StatusCodes.BAD_REQUEST);
			}
		}

		await IndentRepository.updateById(
			id,
			{
				...indentPayload,
				...(unit ? { unit_id: unit } : {}),
				// place_of_use_id is optional; the form sends '' when unselected, which
				// MySQL rejects as an invalid integer literal for this column (see createIndent).
				...('place_of_use_id' in indentPayload
					? { place_of_use_id: indentPayload.place_of_use_id ? Number(indentPayload.place_of_use_id) : null }
					: {}),
			},
			{ transaction },
		);

		// Item-level edits (qty/price/discount/add/delete) only ever reach this far in the
		// payload — replace the whole IndentItems set rather than diffing, mirroring
		// createIndent's item-creation shape. Safe because updateIndent is only reachable
		// while the indent is still editable (draft / rejected / pre-verify in_progress —
		// see workflowEngine.isEditable), i.e. before verify/approve have ever written
		// qty_issued/balance_indent_qty/etc. onto these rows, so there's nothing of value to
		// preserve across the replace. IndentSerialItems cascade-delete via FK on destroy.
		if (Array.isArray(selectedIndents) && selectedIndents.length > 0) {
			await IndentItem.destroy({ where: { indent_id: id }, transaction });

			for (const i of selectedIndents) {
				const indentItem = await IndentItemRepository.create(
					{
						indent_id: id,
						budget_id: i.budget_id,
						model_id: i.model || null,
						product_id: Number(i.product_id),
						batch_id: Number(i.batch_id) || null,
						item_name: i.product_name,
						item_code: i.product_code,
						uom_id: Number(i.selected_uom_id) > 0 ? Number(i.selected_uom_id) : null,
						uom_name: i.selected_uom_unit || null,
						qty: i.qty,
						requested_qty: i.qty,
						avg_rate: i.price,
						discount: Number(i.discount) || 0,
						amount: i.total,
						issue_date: i.issue_date,
						days: i.days,
						specification: i.specification,
						stock_type: i.stock_type,
						productSnapshot: i || null,
						item_type: i?.productSnapshot?.item_type ?? i?.item_type ?? null,
						rate_contract_id: i.rate_contract_id || null,
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

	if (indent.status === 'approved') {
		throw new AppError('Approved indents cannot be deleted', StatusCodes.BAD_REQUEST);
	}

	// PurchaseOrders.indent_id and WorkOrders.indent_id are ON DELETE CASCADE, and GRN
	// (MRN)/QC/Purchase Invoice records in turn hang off those POs/WOs — so deleting an
	// indent that already has a PO/WO raised against it would silently cascade away real
	// purchase documents (and, transitively, any MRN that has already updated VCP stock,
	// leaving VCP's stock ledger permanently out of sync with SCM). The 'approved' status
	// check above only catches this while the indent is still approved; an indent can be
	// cancelled after a PO/WO already exists against it, so check for PO/WO directly
	// regardless of current status.
	const poCount = await PurchaseOrder.count({ where: { indent_id: id } });
	if (poCount > 0) {
		throw new AppError(
			`Cannot delete this Indent because ${poCount} Purchase Order${poCount > 1 ? 's have' : ' has'} already been raised against it. Delete those Purchase Orders first.`,
			StatusCodes.CONFLICT,
		);
	}

	const woCount = await WorkOrder.count({ where: { indent_id: id } });
	if (woCount > 0) {
		throw new AppError(
			`Cannot delete this Indent because ${woCount} Work Order${woCount > 1 ? 's have' : ' has'} already been raised against it. Delete those Work Orders first.`,
			StatusCodes.CONFLICT,
		);
	}

	// If already verified AND not already cancelled (cancel already rolled back VCP stock),
	// stock was deducted in VCP — roll it back first.
	// Service items never had stock deducted, so they're excluded here.
	if (indent.status !== 'cancelled' && indent.isVerified && Array.isArray(indent.IndentItems) && indent.IndentItems.length > 0) {
		const allocationResults = indent.IndentItems
			.filter((item) => item.productSnapshot?.item_type !== 'service')
			.map((item) => ({
				product_id: item.product_id,
				organization_id: indent.org_id,
				indent_id: indent.id,
				stock_type: item.stock_type,
				// base_qty_issued holds base-UOM qty (set at approval/re-issue).
				// qty_issued is in selected UOM — wrong for VCP rollback-stock.
				base_issued_qty: item.base_qty_issued ?? item.qty_issued,
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

	// Scope to current phase only — Phase-isolated rule.
	// Filter by the parent Indent's indent_date (the business date), not IndentItem.createdAt
	// (the DB insert timestamp). Using createdAt caused items to be missed when the indent_date
	// fell within a phase but the row was inserted after the phase end date.
	const { startDate, endDate } = getPhaseRange(budget, phasePeriod);
	const indentDateFilter = startDate
		? { [Op.gt]: startDate, [Op.lte]: endDate }
		: { [Op.lte]: endDate };

	const existingItems = await IndentItem.findAll({
		where: { budget_id: budgetId },
		include: [{ model: Indent, as: 'indent', where: { indent_date: indentDateFilter }, attributes: [], required: true }],
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
async function validateBudgetPhaseOnCreate(selectedIndents, indentDate, budgetType, transaction, excludeIndentId = null) {
	const budgetGroups = new Map();
	for (const item of selectedIndents) {
		const budgetId = item.budget_id;
		if (!budgetGroups.has(budgetId)) budgetGroups.set(budgetId, []);
		budgetGroups.get(budgetId).push(item);
	}

	for (const [budgetId, items] of budgetGroups) {
		// Row-locked within the caller's transaction (see createIndent/updateIndent) so two
		// concurrent requests against the same budget serialize instead of both reading the
		// same "previously consumed" total and both passing validation.
		const budget = await Budget.findOne({
			where: { id: budgetId },
			transaction,
			lock: transaction ? transaction.LOCK.UPDATE : undefined,
		});
		if (!budget) continue;

		const phaseResult = getPhaseQuantityDateWise(budget, indentDate);
		if (!phaseResult) continue;

		const { value: phaseAmount, phasePeriod } = phaseResult;

		// Scope consumed query to the current phase's date window (phase-isolated rule)
		// Filter by Indent.indent_date (business date), not IndentItem.createdAt.
		const { startDate, endDate } = getPhaseRange(budget, phasePeriod);
		const indentDateFilter = startDate
			? { [Op.gt]: startDate, [Op.lte]: endDate }
			: { [Op.lte]: endDate };

		const previousItems = await IndentItem.findAll({
			where: {
				budget_id: budgetId,
				// updateIndent replaces this indent's own items wholesale (destroy+recreate) —
				// exclude them here so we don't double-count the indent's own pre-edit rows on
				// top of the freshly-supplied `selectedIndents` totals below.
				...(excludeIndentId ? { indent_id: { [Op.ne]: excludeIndentId } } : {}),
			},
			include: [{ model: Indent, as: 'indent', where: { indent_date: indentDateFilter }, attributes: [], required: true }],
			transaction,
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
async function validateIndentBudgetAmount(indent, allocationMap, transaction) {
	const budgetGroups = new Map();
	for (const item of indent.IndentItems) {
		const budgetId = item.budget_id;
		if (!budgetGroups.has(budgetId)) {
			budgetGroups.set(budgetId, { budget: item.budget, items: [] });
		}
		budgetGroups.get(budgetId).items.push(item);
	}

	for (const [budgetId, { budget: preloadedBudget, items }] of budgetGroups) {
		if (!preloadedBudget) continue;

		// Re-fetch with a row lock inside the caller's transaction rather than trusting the
		// `budget` eager-loaded onto indent.IndentItems earlier (before this transaction/lock
		// existed) — see the comment at this function's call site in approveIndent.
		const budget = transaction
			? await Budget.findOne({ where: { id: budgetId }, transaction, lock: transaction.LOCK.UPDATE })
			: preloadedBudget;
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
		const indentDateFilter = startDate
			? { [Op.gt]: startDate, [Op.lte]: endDate }
			: { [Op.lte]: endDate };

		const previousItems = await IndentItem.findAll({
			where: {
				budget_id: budgetId,
				indent_id: { [Op.ne]: indent.id },
			},
			include: [{ model: Indent, as: 'indent', where: { indent_date: indentDateFilter }, attributes: [], required: true }],
			transaction,
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
