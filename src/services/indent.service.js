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
} = require('../models/index');
const AppError = require('../utils/AppError');
const { Op } = require('sequelize');
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
			...indentPayload
		} = payload;

		// 🔹 Create Indent
		const indent = await IndentRepository.create(
			{ ...indentPayload, department_id: 1, createdBy },
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

			// itemsToCreate = selectedIndents.map((i) => {
			// 	return {
			// 		indent_id: indent.id,
			// 		budget_id: i.budget_id,
			// 		model_id: i.model || null,
			// 		product_id: Number(i.product_id),
			// 		batch_id: Number(i.batch_id) || null,
			// 		item_name: i.product_name,
			// 		item_code: i.product_code,
			// 		uom_id: i.selected_uom_id || null,
			// 		uom_name: i.selected_uom_unit || null,
			// 		qty: i.qty,
			// 		requested_qty: i.qty,
			// 		avg_rate: i.price,
			// 		discount: i.discount,
			// 		amount: i.total,
			// 		issue_date: i.issue_date,
			// 		days: i.days,
			// 		specification: i.specification,
			// 		stock_type: i.stock_type,
			// 		productSnapshot: i || null,
			// 	};
			// });
			// console.log('Final Updated itemsToCreate ', itemsToCreate);
		}

		// console.log('itemsToCreate ', itemsToCreate);

		// // 🔹 Bulk Create Items
		// if (itemsToCreate.length > 0) {
		// 	await IndentItemRepository.bulkCreate(itemsToCreate, { transaction });
		// }

		await transaction.commit();

		return IndentRepository.findById(indent.id);
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
		isVerified: selectedStatusId === 'yes' ? 1 : 0,
		// createdAt: {
		// 	[Op.gte]: from_date,
		// 	[Op.lt]: to_date,
		// },
	};

	if (selectedBudgetTypeId > 0) where.budgetType = selectedBudgetTypeId;

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

	const indentItemsWhere = {};
	if (hasPurchaseQuantityIssue) {
		indentItemsWhere['qty_for_purchase_order'] = {
			[Op.gt]: 0,
		};
	}
	if (budgetId > 0) {
		indentItemsWhere['budget_id'] = budgetId;
	}

	const filterOptions = {
		where,
		include: [
			{ association: 'department' },
			{ association: 'period' },
			{ association: 'remark' },
			{
				model: IndentItem,
				as: 'IndentItems',
				where: indentItemsWhere,
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
		const indent = await IndentRepository.findById(id);
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
	const t = await sequelize.transaction();
	const user = req.user;
	const verifiedBy = {
		id: user.id,
		name: user.name,
		email: user.email,
	};
	try {
		const indent = await IndentRepository.findById(id);
		if (!indent) {
			throw new AppError(
				`Indent with ID ${id} not found`,
				StatusCodes.NOT_FOUND,
			);
		}
		if (!items || !Array.isArray(items) || items.length === 0) {
			throw new AppError(
				'Updated indents must be a non-empty array',
				StatusCodes.BAD_REQUEST,
			);
		}

		const updatedIndentQuantityMap = new Map(
			items.map((i) => [i.product_id, i]),
		);

		console.log('updatedIndentQuantityMap => ', updatedIndentQuantityMap);
		// return
		const updatedIndents = [];

		if (Array.isArray(indent.IndentItems) && indent.IndentItems.length > 0) {
			console.log('indent.IndentItems ', indent.IndentItems);
			const plainIndentItems = indent.IndentItems.map((i) =>
				i.get({ plain: true }),
			);
			const modifiedIndentItems = plainIndentItems.map((indent) => ({
				...indent,
				qty: updatedIndentQuantityMap.get(indent.product_id).issue_qty,
			}));
			console.log('modifiedIndentItems ', modifiedIndentItems);
			const { allocationResults } =
				await verifyIndentQuantityWithProductServices(
					req,
					modifiedIndentItems,
					true,
				);

			console.log(
				'Approved Indent verifyIndentQuantityWithProductServices Response ',
				allocationResults,
			);
			const allocationMap = new Map(
				allocationResults.map((i) => [i.product_id, i]),
			);
			console.log('new allocationMap ', allocationMap);

			if (indent.budgetType === 'value-wise') {
				const errorMessage = await validateIndentBudgetAmount(
					indent,
					allocationMap,
				);

				if (errorMessage) {
					throw new AppError(errorMessage, StatusCodes.BAD_REQUEST);
				}
			}

			// return;
			for (const i of indent.IndentItems) {
				const allocation = allocationMap.get(i.product_id);

				const issuedQty = allocation?.issued_qty || 0;
				const purchaseQty = allocation?.qty_for_purchase_order || 0;

				const updatedIssueQty =
					updatedIndentQuantityMap.get(i.product_id)?.issue_qty || 0;

				await i.update(
					{
						qty_issued: issuedQty,
						qty_for_purchase_order: purchaseQty,
						minimum_stock_quantity: allocation?.minimum_stock_quantity || 0,
						checkMinimumStock: allocation?.checkMinimumStock || false,
						qty_updated_by_verifier: updatedIssueQty,
					},
					{ transaction: t },
				);

				if (i.stock_type === 'serial') {
					if (allocation.issuedSerials.length > 0) {
						await IndentSerialRepository.update(
							{ is_issued: 1 },
							{
								where: { serial_no: { [Op.in]: allocation.issuedSerials } },
								transaction: t,
							},
						);
					}
				}
			}
		}

		await indent.update(
			{ isVerified: true, verifiedBy: verifiedBy },
			{ transaction: t },
		);

		await t.commit();
	} catch (error) {
		await t.rollback();
		console.log('error ', error);
		throw error;
	}
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

		const phaseTime = new Date(phase.date).getTime();

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

async function verifyIndentQuantityWithProductServices(
	req,
	selectedIndents,
	allocateQuantity = false,
) {
	const URL = `${VCP_SERVICE_API_BASE_URL}${VCP_SERVICE_PRODUCT_ENDPOINT}/verify-stock`;
	const token = req.cookies.accessToken;

	const response = await fetch(URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
			'x-s2s-comm-key': S2S_COMM_KEY,
		},
		body: JSON.stringify({ allocateQuantity, indents: selectedIndents }),
	});

	const data = await response.json();

	if (!response.ok) {
		throw new AppError(
			data?.message || 'Verify stock API failed',
			response.status,
		);
	}

	return data;
}

async function validateIndentBudgetAmount(indent, allocationMap) {
	const budget = indent.IndentItems?.[0]?.budget;

	if (!budget) return null;

	const totalIndentAmount = indent.IndentItems.reduce((total, item) => {
		const allocation = allocationMap.get(item.product_id);

		const issuedQty = allocation?.issued_qty ?? 0;
		const avgRate = Number(item.avg_rate) || 0;

		return total + avgRate * issuedQty;
	}, 0);

	const {
		value: phaseAmount,
		phaseDate,
		phasePeriod,
	} = getPhaseQuantityDateWise(budget, new Date());

	logger.info('Budget validation', {
		phaseAmount,
		totalIndentAmount,
		phasePeriod,
		phaseDate,
	});

	if (totalIndentAmount > phaseAmount) {
		return `Total amount ${totalIndentAmount} cannot be greater than the phase amount ${phaseAmount}.`;
	}

	return null;
}
