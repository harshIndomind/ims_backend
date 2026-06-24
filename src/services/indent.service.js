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
			{ ...indentPayload, unit_id: unit, department_id: 1, createdBy, org_id: user.org_id },
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

		await transaction.commit();

		return IndentRepository.findById({
			where: { id: indent.id },
			include: [
				{ association: 'department' },
				{ association: 'period' },
				{ association: 'remark' },
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
		selectedDepartmentId,
		selectedStatusId,
		selectedBudgetTypeId,
		indentNo,
		hasPurchaseQuantityIssue = false,
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

	if (selectedStatusId === 'yes') where.isVerified = 1;
	if (selectedStatusId === 'no') where.isVerified = 0;
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
	const departmentId = Number(selectedDepartmentId);
	const budgetId = Number(selectedBudgetId);

	if (periodId > 0) where.period_id = periodId;
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
			],
		},
		include: [
			{ association: 'department' },
			{ association: 'period' },
			{ association: 'remark' },
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

	return IndentRepository.findAll({}, filterOptions);
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

exports.approveIndent = async (req, id, items) => {
	const user = req.user;
	const verifiedBy = { id: user.id, name: user.name, email: user.email };

	// --- Phase 0: fetch indent and validate inputs before touching any external service ---
	const indent = await IndentRepository.findById({
		where: { id },
		include: [
			{ association: 'department' },
			{ association: 'period' },
			{ association: 'remark' },
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
	if (!items || !Array.isArray(items) || items.length === 0) {
		throw new AppError('Updated indents must be a non-empty array', StatusCodes.BAD_REQUEST);
	}

	const updatedIndentQuantityMap = new Map(items.map((i) => [i.product_id, i]));

	// Verify every indent item has a matching entry in the caller-supplied map
	for (const i of indent.IndentItems) {
		if (!updatedIndentQuantityMap.has(i.product_id)) {
			throw new AppError(
				`Missing issue_qty for product_id ${i.product_id}`,
				StatusCodes.BAD_REQUEST,
			);
		}
	}

	if (!Array.isArray(indent.IndentItems) || indent.IndentItems.length === 0) {
		throw new AppError('Indent has no items to approve', StatusCodes.BAD_REQUEST);
	}

	const plainIndentItems = indent.IndentItems.map((i) => i.get({ plain: true }));
	const modifiedIndentItems = plainIndentItems.map((item) => ({
		...item,
		qty: updatedIndentQuantityMap.get(item.product_id).issue_qty,
	}));

	// --- Phase 1: dry-run verify (no deduction) to get allocation data for validation ---
	const { allocationResults: dryRunResults } =
		await verifyIndentQuantityWithProductServices(req, modifiedIndentItems, false);

	const dryRunMap = new Map(dryRunResults.map((i) => [i.product_id, i]));

	if (indent.budgetType === 'value-wise') {
		const errorMessage = await validateIndentBudgetAmount(indent, dryRunMap);
		if (errorMessage) {
			throw new AppError(errorMessage, StatusCodes.BAD_REQUEST);
		}
	}

	// --- Phase 2: actual allocation (VCP deducts stock in its own committed transaction) ---
	const { allocationResults } = await verifyIndentQuantityWithProductServices(
		req,
		modifiedIndentItems,
		true,
	);

	const allocationMap = new Map(allocationResults.map((i) => [i.product_id, i]));

	// --- Phase 3: persist in SCM — compensate VCP if this fails ---
	const transaction = await sequelize.transaction();
	try {
		for (const i of indent.IndentItems) {
			const allocation = allocationMap.get(i.product_id);
			const issuedQty = allocation?.issued_qty || 0;
			const purchaseQty = allocation?.qty_for_purchase_order || 0;
			const updatedIssueQty = updatedIndentQuantityMap.get(i.product_id)?.issue_qty || 0;

			await i.update(
				{
					qty_issued: issuedQty,
					qty_for_purchase_order: purchaseQty,
					minimum_stock_quantity: allocation?.minimum_stock_quantity || 0,
					checkMinimumStock: allocation?.checkMinimumStock || false,
					qty_updated_by_verifier: updatedIssueQty,
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

		await indent.update({ isVerified: true, verifiedBy }, { transaction });

		await transaction.commit();
	} catch (scmError) {
		await transaction.rollback();
		logger.error('SCM DB update failed after VCP stock deduction — attempting rollback', { scmError });

		// Compensating transaction: restore stock in VCP
		try {
			await rollbackStockInProductService(req, allocationResults);
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
				stock_type: item.stock_type,
				base_issued_qty: item.qty_issued,
				batch_id: item.batch_id,
				issuedSerials: item.serial_items
					.filter((s) => s.is_issued)
					.map((s) => s.serial_no),
			}));

		if (allocationResults.length > 0) {
			await rollbackStockInProductService(req, allocationResults);
		}
	}

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

async function rollbackStockInProductService(req, allocationResults) {
	const URL = `${VCP_SERVICE_API_BASE_URL}${VCP_SERVICE_PRODUCT_ENDPOINT}/rollback-stock`;
	const token = req.cookies.accessToken;

	const response = await fetch(URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
			'x-s2s-comm-key': S2S_COMM_KEY,
		},
		body: JSON.stringify({ allocationResults }),
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
			body: JSON.stringify({ allocateQuantity, indents: selectedIndents }),
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
