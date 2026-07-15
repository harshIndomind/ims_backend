const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const {
	purchaseOrderRepository,
	purchaseOrderItemsRepository,
	purchaseOrderSerialItemsRepository,
	IndentItemRepository,
} = require('../repository/index');
const logger = require('../utils/logger');
const { sequelize } = require('../models/index');
const { Op, where } = require('sequelize');
const {
	User,
	organization,
	PurchaseOrder,
	PurchaseOrderItem,
	IndentItem,
	Indent,
	Role,
	PaymentRequisition,
	MasterTermsCondition,
	MasterUnit,
	Department,
	MasterPlaceOfUse,
} = require('../models/index');
const {
	generateInvoiceHTMLPDF,
	generateInvoiceHTML,
} = require('../pdf/htmlPdfGenerator');
const { fetch } = require('undici');
const { VCP_SERVICE_API_BASE_URL, BASE_URL } = require('../config/serverConfig');
const { generateSignedUrl, getImageAsBase64DataUrl } = require('../utils/s3Bucket');
const ExcelJS = require('exceljs');
const path = require('path');
const workflowEngine = require('./workflowEngine.service');
const auditLogService = require('./auditLog.service');
const { createWorkflowDocumentService } = require('./workflowDocument.factory');

const DOCUMENT_TYPE = 'purchase_order';

async function fetchPurchaseOrderForWorkflow(id) {
	const po = await purchaseOrderRepository.findOne({
		where: { id },
		include: [
			{ model: PurchaseOrderItem, as: 'items' },
			{ model: Indent, as: 'indent', attributes: ['id', 'unit_id', 'department_id'] },
		],
	});
	if (!po) throw new AppError(`Purchase Order with ID ${id} not found`, StatusCodes.NOT_FOUND);
	return po;
}

const poWorkflow = createWorkflowDocumentService({
	documentType: DOCUMENT_TYPE,
	fetchById: (id) => fetchPurchaseOrderForWorkflow(id),
});

exports.createPurchaseOrder = async (req, payload) => {
	const transaction = await sequelize.transaction();
	try {
		const { org_id } = req.user;
		const {
			indent_id,
			po_qc_check,
			dueDate,
			total_taxable,
			total_tax,
			isRoundOff,
			grandTotal,
			payment_type,
			bank_id,
			additionalRemarks,
			state_same,
			orderType,
			// Objects
			vendorInfo,
			purchaseOrderDetail,
			productItems,
			paymentType,
			additionalNotes,
			customField1,
			customField2,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
			payment_term_value,
			payment_term_amount
		} = req.body;

		const indentForBudget = await Indent.findOne({ where: { id: indent_id }, attributes: ['budgetType'], transaction });
		validateItemsLimits(productItems, indentForBudget?.budgetType);

		const isSerialDuplicate = checkForDuplicateSerials(productItems);

		if (isSerialDuplicate.status) {
			throw new AppError(
				`Duplicate serial numbers found in the invoice items: ${isSerialDuplicate.duplicateSerials.join(
					', ',
				)}`,
				417,
			);
		}

		const poObject = {
			org_id,
			indent_id,
			orderType: orderType || 'purchase_order',
			vendorId: vendorInfo.vendor_id || null,
			dueDate,
			poPrefix: purchaseOrderDetail.poPrefix || null,
			poNo: purchaseOrderDetail.poNumber || null,
			poPostfix: purchaseOrderDetail.poPostfix || null,
			total_taxable: parseFloat(total_taxable || 0),
			total_tax: parseFloat(total_tax || 0),
			grandTotal: parseFloat(grandTotal || 0),
			isRoundOff,
			paymentType: payment_type,
			vendorInfo,
			poDetail: purchaseOrderDetail,
			additionalNotes,
			customFields: [customField1, customField2],
			remarks: additionalRemarks,
			same_state: state_same,
			status: 'draft',
			remainingAmount: grandTotal,
			po_qc_check,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
			payment_term_value,
			payment_term_amount,
			start_date: purchaseOrderDetail.start_date || null,
			end_date: purchaseOrderDetail.end_date || null,
			retention: purchaseOrderDetail.retention != null ? parseFloat(purchaseOrderDetail.retention) : null,
			retention_amount: purchaseOrderDetail.retention != null
				? parseFloat(((parseFloat(purchaseOrderDetail.retention) / 100) * parseFloat(grandTotal || 0)).toFixed(2))
				: null,
		};

		const purchaseOrder = await purchaseOrderRepository.create(poObject, {
			transaction,
		});

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: purchaseOrder.id,
			action: 'create',
			newState: { poNo: poObject.poNo },
			transaction,
		});

		for (const item of productItems) {
			const poItemsObject = {
				purchase_order_id: purchaseOrder.id,
				product_id: item.product_id,
				budget_id: item.budget_id,
				productSnapshot: item.productSnapshot,
				uomSnapshot: item.uomSnapshot || null,
				taxSnapshot: item.taxSnapshot || null,
				budget_no: item.budget_no,
				batch_id: item.batch_id || null,
				hsn_sac_code: item.hsn_sac_code || null,
				qty: parseFloat(item.qty),
				price: parseFloat(item.price),
				discount: parseFloat(item.discount || 0),
				discount_price_type: item.discount_price_type,
				tax_id: item.tax_id,
				igst: parseFloat(item.igst || 0),
				cgst: parseFloat(item.cgst || 0),
				sgst: parseFloat(item.sgst || 0),
				cess: parseFloat(item.cess || 0),
				total: parseFloat(item.total || 0),
				stock_type: item.stock_type,
				note: item.note,
				selected_uom_id:
					Number(item.selected_uom_id) > 0
						? Number(item.selected_uom_id)
						: null,
				specification: item.specification,
				rate_contract_id: item.rate_contract_id || null,
				rate_contract_product_id: item.rate_contract_product_id || null,
				rc_snapshot: item.rc_snapshot || null,
			};
			await purchaseOrderItemsRepository.create(
				poItemsObject,
				{ transaction },
			);
		}

		await transaction.commit();

		return purchaseOrder;
	} catch (error) {
		await transaction.rollback();
		console.error(error);
		throw error;
	}
};

exports.updatePurchaseOrder = async (req) => {
	const { id } = req.params;

	const transaction = await sequelize.transaction();
	try {
		const {
			org_id,
			indent_id,
			po_qc_check,
			dueDate,
			total_taxable,
			total_tax,
			isRoundOff,
			grandTotal,
			payment_type,
			bank_id,
			additionalRemarks,
			state_same,
			orderType,
			// Objects
			vendorInfo,
			purchaseOrderDetail,
			productItems,
			paymentType,
			additionalNotes,
			customField1,
			customField2,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
			payment_term_value,
			payment_term_amount
		} = req.body;

		const indentForBudget = await Indent.findOne({ where: { id: indent_id }, attributes: ['budgetType'], transaction });
		validateItemsLimits(productItems, indentForBudget?.budgetType);

		const isSerialDuplicate = checkForDuplicateSerials(productItems);

		if (isSerialDuplicate.status) {
			throw new AppError(
				`Duplicate serial numbers found in the invoice items: ${isSerialDuplicate.duplicateSerials.join(
					', ',
				)}`,
				417,
			);
		}

		const poObject = {
			org_id,
			indent_id,
			orderType: orderType || 'purchase_order',
			vendorId: vendorInfo.vendor_id || null,
			dueDate,
			poPrefix: purchaseOrderDetail.poPrefix || null,
			poNo: purchaseOrderDetail.poNumber || null,
			poPostfix: purchaseOrderDetail.poPostfix || null,
			total_taxable: parseFloat(total_taxable || 0),
			total_tax: parseFloat(total_tax || 0),
			grandTotal: parseFloat(grandTotal || 0),
			isRoundOff,
			paymentType: payment_type,
			vendorInfo,
			poDetail: purchaseOrderDetail,
			additionalNotes,
			customFields: [customField1, customField2],
			remarks: additionalRemarks,
			same_state: state_same,
			remainingAmount: grandTotal,
			po_qc_check,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
			payment_term_value,
			payment_term_amount,
			start_date: purchaseOrderDetail.start_date || null,
			end_date: purchaseOrderDetail.end_date || null,
			retention: purchaseOrderDetail.retention != null ? parseFloat(purchaseOrderDetail.retention) : null,
			retention_amount: purchaseOrderDetail.retention != null
				? parseFloat(((parseFloat(purchaseOrderDetail.retention) / 100) * parseFloat(grandTotal || 0)).toFixed(2))
				: null,
		};

		// status is intentionally omitted from the update payload — the workflow engine
		// is the sole owner of status transitions after creation.

		const purchaseOrder = await purchaseOrderRepository.findById(id, {
			transaction,
		});

		if (!purchaseOrder) {
			throw new AppError('Pruchase order not found.');
		}

		await purchaseOrderRepository.update(purchaseOrder, poObject, {
			transaction,
		});

		// Fetch all current PO items so we can detect additions and removals.
		const existingItems = await PurchaseOrderItem.findAll({
			where: { purchase_order_id: purchaseOrder.id },
			transaction,
		});
		const existingById = new Map(existingItems.map((e) => [e.id, e]));

		// IDs present in the new payload — used to detect removed items.
		const payloadIds = new Set(
			productItems.filter((i) => i.id).map((i) => Number(i.id)),
		);

		// Remove items that are no longer in the payload.
		for (const existing of existingItems) {
			if (!payloadIds.has(existing.id)) {
				await existing.destroy({ transaction });
			}
		}

		for (const item of productItems) {
			const poItemsObject = {
				purchase_order_id: purchaseOrder.id,
				product_id: item.product_id,
				budget_id: item.budget_id,
				productSnapshot: item.productSnapshot,
				uomSnapshot: item.uomSnapshot || null,
				taxSnapshot: item.taxSnapshot || null,
				budget_no: item.budget_no,
				batch_id: Number(item.batch_id) || null,
				hsn_sac_code: item.hsn_sac_code || null,
				qty: parseFloat(item.qty),
				price: parseFloat(item.price),
				discount: parseFloat(item.discount || 0),
				discount_price_type: item.discount_price_type,
				tax_id: item.tax_id,
				igst: parseFloat(item.igst || 0),
				cgst: parseFloat(item.cgst || 0),
				sgst: parseFloat(item.sgst || 0),
				cess: parseFloat(item.cess || 0),
				total: parseFloat(item.total || 0),
				stock_type: item.stock_type,
				note: item.note,
				selected_uom_id:
					Number(item.selected_uom_id) > 0
						? Number(item.selected_uom_id)
						: null,
				specification: item.specification,
				rate_contract_id: item.rate_contract_id || null,
				rate_contract_product_id: item.rate_contract_product_id || null,
				rc_snapshot: item.rc_snapshot || null,
			};

			if (item.id && existingById.has(Number(item.id))) {
				const existing = existingById.get(Number(item.id));
				await purchaseOrderItemsRepository.update(existing, poItemsObject, { transaction });
			} else {
				// New item added during update.
				await purchaseOrderItemsRepository.create(poItemsObject, { transaction });
			}
		}

		await transaction.commit();

		return purchaseOrder;
	} catch (error) {
		await transaction.rollback();
		console.error(error);
		throw error;
	}
};

exports.getAllPurchaseOrders = async (req) => {
	const { org_id, role } = req.user;

	const { from_date, to_date, unit_id, due_date_from, due_date_to, payment_status } = req.query;
	const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
	const offset = req.query.offset ? parseInt(req.query.offset) : undefined;

	if (!org_id && role !== 'Admin') {
		throw new AppError(`You don't authorize to access this api.`);
	}

	const andConditions = [{ org_id }];

	if (from_date || to_date) {
		const fromDate = new Date(from_date);
		const toDate = new Date(to_date);
		if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
			throw new AppError('Invalid date range');
		}
		toDate.setHours(23, 59, 59, 999);
		andConditions.push({ createdAt: { [Op.between]: [fromDate, toDate] } });
	}

	if (due_date_from || due_date_to) {
		const dueDateWhere = {};
		if (due_date_from) {
			const d = new Date(due_date_from);
			d.setHours(0, 0, 0, 0);
			dueDateWhere[Op.gte] = d;
		}
		if (due_date_to) {
			const d = new Date(due_date_to);
			d.setHours(23, 59, 59, 999);
			dueDateWhere[Op.lte] = d;
		}
		andConditions.push({ dueDate: dueDateWhere });
	}

	if (payment_status) {
		const statuses = payment_status.split(',').map((s) => s.trim()).filter(Boolean);
		const hasCancelled = statuses.includes('CANCELLED');
		const paymentStatuses = statuses.filter((s) => s !== 'CANCELLED');

		if (hasCancelled && paymentStatuses.length > 0) {
			andConditions.push({ [Op.or]: [{ paymentStatus: { [Op.in]: paymentStatuses } }, { status: 'cancelled' }] });
		} else if (hasCancelled) {
			andConditions.push({ status: 'cancelled' });
		} else if (paymentStatuses.length > 0) {
			andConditions.push({ paymentStatus: { [Op.in]: paymentStatuses } });
		}
	}

	const findOptions = {
		where: { [Op.and]: andConditions },
		attributes: [
			'id',
			'poPrefix',
			'poNo',
			'poPostfix',
			'dueDate',
			'grandTotal',
			'totalPaid',
			'remainingAmount',
			'poDetail',
			'status',
			'createdAt',
			'paymentStatus',
			'vendorInfo',
		],
		include: [
			{
				model: PaymentRequisition,
				as: 'paymentRequisitions',
				attributes: ['id', 'requisition_no', 'requisition_amount', 'status'],
				where: { status: 'APPROVED' },
				required: false,
			},
			{
				model: Indent,
				as: 'indent',
				attributes: ['id', 'unit_id', 'department_id'],
				where: unit_id ? { unit_id: Number(unit_id) } : undefined,
				required: !!unit_id,
				include: [
					{ model: MasterUnit, as: 'unit', attributes: ['id', 'unitName', 'unitCd'] },
					{ model: Department, as: 'department', attributes: ['id', 'name'] },
				],
			},
		],
		order: [['createdAt', 'DESC']],
	};

	if (limit !== undefined) findOptions.limit = limit;
	if (offset !== undefined) findOptions.offset = offset;

	const purchaseOrders = await purchaseOrderRepository.findAll(findOptions);

	let response = purchaseOrders.rows.map((inv) => inv.get({ plain: true }));
	console.log('response ', response);

	if (purchaseOrders) {
		response = response.map((invoice) => {
			return {
				...invoice,
				paymentMsg: (() => {
					let message = null;
					const ref = [];
					if (invoice.payments && invoice.payments.length > 0) {
						const totalAmountPaid = invoice.payments.reduce(
							(acc, v) => acc + parseFloat(v.amount_adjusted),
							0,
						);
						invoice.payments.forEach((payment, i) => {
							ref.push(
								`Ref-${i + 1}: Receipt No. ${payment.receipt.receiptPrefix}${
									payment.receipt.receiptNumber
								}${payment.receipt.receiptPostfix} - Payment of '${
									payment.amount_adjusted
								}' paid through ${String(
									payment?.receipt.paymentType.toLowerCase(),
								)}.`,
							);
						});
						// message = `Payment of '${totalAmountPaid}' paid through ${String(
						// 	invoice.payments[0]?.receipt.paymentType
						// )}.`;
						message = ref;
					}
					return message;
				})(),
			};
		});
	}

	return { rows: response, count: purchaseOrders.count };
};

exports.getPurchaseOrderById = async (req) => {
	const { id } = req.params;
	const { org_id, role } = req.user;

	if (!org_id && role !== 'Admin') {
		throw AppError(`You don't authorize to access this api.`);
	}

	const purchaseOrder = await purchaseOrderRepository.findOne({
		where: { id, org_id: org_id },
		include: [
			{
				model: PurchaseOrderItem,
				as: 'items',
				include: [
					// {
					// 	model: InvoiceItemSerial,
					// 	as: 'serials',
					// },
					// {
					// 	model: ProductBatch,
					// 	as: 'batches',
					// },
					// {
					// 	model: Product,
					// 	as: 'product',
					// },
					// {
					// 	model: ProductUOM,
					// 	as: 'uoms',
					// 	include: {
					// 		model: Unit,
					// 		as: 'unit',
					// 		attributes: ['code', 'name'],
					// 	},
					// },
				],
			},
			{
				model: Indent,
				as: 'indent',
				attributes: ['id', 'unit_id', 'department_id', 'period_id', 'place_of_use_id'],
				include: [
					{ model: MasterUnit, as: 'unit', attributes: ['id', 'unitName', 'unitCd'] },
					{ model: Department, as: 'department', attributes: ['id', 'name'] },
					{ model: MasterPlaceOfUse, as: 'placeOfUse' },
				],
			},
		],
		order: [['createdAt', 'DESC']],
	});

	if (!purchaseOrder) {
		return res.status(404).json({ message: 'Purchase order not found' });
	}

	// const serialsData = await ProductSerial.findAll();
	// const batchData = await ProductBatch.findAll();

	// Convert to plain object first
	const poDetail = purchaseOrder.get({ plain: true });

	const response = {
		...poDetail,
		productItems: poDetail.items.map((item) => ({
			...item,
			item_type: item.productSnapshot.item_type,
			product_name: item.productSnapshot.name,
			// batches: item.productSnapshot.stock_type === 'batch' ? batchData : [],
			batches: [],
			serials: [],
			// serials: serialsData.map((s) => ({
			// 	...s,
			// 	label: s.serial_no,
			// 	value: s.id.toString(),
			// 	key: s.id.toString(),
			// })),
			// selectedSerials: item.serials?.map((serial) => serial.serial_no) || [],
			// stockQty: (() => {
			// 	if (item.stock_type === 'normal') {
			// 		return item.product.available_qty || 1;
			// 	} else if (item.stock_type === 'batch') {
			// 		return batchData ? batchData.length : 0;
			// 	} else if (item.stock_type === 'serial') {
			// 		// const totalSerials = serialsData.filter(
			// 		// 	(s) => s.product_id === item.product_id && s.is_sell === 0
			// 		// ).length;
			// 		return serialsData ? serialsData.length : 0;
			// 	}
			// 	return 0;
			// })(),
			stockQty: item.qty,
		})),
		additionalRemarks: poDetail.remarks,
	};

	return response;
};

exports.deletePurchaseOrder = async (req) => {
	const { id } = req.params;
	const { org_id, role } = req.user;

	// auth: user must have org_id OR be Admin
	if (!org_id && role !== 'Admin') {
		throw new AppError(`You don't authorize to access this api.`, 403);
	}

	// start transaction
	const transaction = await sequelize.transaction();

	try {
		logger.warn('First');
		const purchaseOrder = await purchaseOrderRepository.findById(id, {
			include: [{ model: PurchaseOrderItem, as: 'items' }],
			transaction,
		});
		logger.warn('second');
		if (!purchaseOrder) {
			await transaction.rollback();
			logger.warn('Purchase Order not found for delete', { id });
			throw new AppError('Purchase Order not found', StatusCodes.NOT_FOUND);
		}
		logger.warn('third');
		// Only restore indent qty if the PO was submitted (delta was applied on submit).
		if (purchaseOrder.status !== 'draft') {
			for (const item of purchaseOrder.items) {
				await applyIndentQtyDelta(
					parseFloat(item.qty),
					purchaseOrder.indent_id,
					item.product_id,
					item.selected_uom_id ?? null,
					transaction,
				);
			}
		}
		logger.warn('fourth');
		await PaymentRequisition.destroy({ where: { po_id: id }, transaction });
		logger.warn('five');
		await purchaseOrderRepository.delete(purchaseOrder, { transaction });

		logger.info('Purchase Order deleted', { id });
		logger.warn('six');
		await transaction.commit();
		return true;
	} catch (error) {
		if (transaction && !transaction.finished) {
			try {
				logger.warn('First', {error});
				await transaction.rollback();
				return false;
			} catch (rbErr) {
				console.error('rollback error', rbErr);
				throw rbErr;
			}
		}
		throw error;
	}
};

exports.getPurchaseOrderNo = async (req) => {
	const user = req.user;
	logger.info('getPurchaseOrderNo: ', { user });
	let errorMsg = 'Invalid user or organization ID';
	if (
		!user ||
		!user.org_id ||
		!user.roles.includes('org_admin') ||
		user.roles.includes('app_admin')
	) {
		if (user.role === 'Super Admin') {
			errorMsg = "As a super admin user you can't create a purchase order.";
		}
		throw new AppError(errorMsg, 403);
	}

	// Find the latest purchase order with the given prefix and postfix
	const latestPurchaseOrder = await purchaseOrderRepository.findOne({
		where: {
			org_id: user.org_id,
		},
		order: [['createdAt', 'DESC']],
	});
	logger.debug('latestPurchaseOrder ', latestPurchaseOrder);

	let newPurchaseOrderNumber = 1;
	if (latestPurchaseOrder) {
		const latestNumber = parseInt(latestPurchaseOrder.poNo, 10);
		if (!isNaN(latestNumber)) {
			newPurchaseOrderNumber = latestNumber + 1;
		}
	}

	return newPurchaseOrderNumber.toString().padStart(4, '0');
};

// Apply a base-unit delta to every IndentItem row for a product, scaling each row's
// delta by its own uomSnapshot.qty so that qty_for_purchase_order stays in that row's UOM.
async function applyIndentQtyDelta(uomDelta, indent_id, product_id, uom_id, transaction) {
	const isBaseUnit = uom_id === null || uom_id === undefined || Number(uom_id) === 0;
	const row = await IndentItem.findOne({
		where: {
			indent_id,
			product_id,
			uom_id: isBaseUnit ? { [Op.or]: [null, 0] } : uom_id,
		},
		transaction,
	});
	logger.debug("applyIndentQtyDelta", {row});
	if (!row) return;
	await IndentItemRepository.increment(
		{ qty_for_purchase_order: uomDelta },
		{ where: { id: row.id }, transaction },
	);
}

function validateItemsLimits(productItems, budgetType) {
	// Reject same product + same UOM (different UOM for the same product is allowed).
	const uomSeen = new Set();
	for (const item of productItems) {
		const uomKey = `${item.product_id}:${item.selected_uom_id ?? 'base'}`;
		if (uomSeen.has(uomKey)) {
			const name = item.productSnapshot?.name || `product ${item.product_id}`;
			throw new AppError(
				`${name}: duplicate UOM — each product may appear only once per UOM on a PO`,
			);
		}
		uomSeen.add(uomKey);
	}

	// Value-wise indents are controlled by amount, not qty — skip the qty cap.
	if (budgetType === 'value-wise') return;

	// Group items by product; sum their base-unit qty (selected qty / uomSnapshot.qty).
	// qty_for_purchase_order is stored in each row's own UOM, so divide by uomQty to get base.
	const byProduct = {};
	for (const item of productItems) {
		const uomQty = parseFloat(item.uomSnapshot?.qty) || 1;
		const baseQty = parseFloat(item.qty) / uomQty;
		const key = String(item.product_id);
		if (!byProduct[key]) {
			byProduct[key] = {
				name: item.productSnapshot?.name || `product ${item.product_id}`,
				limit: Number(item.qty_for_purchase_order) / uomQty,
				totalBaseQty: 0,
			};
		}
		byProduct[key].totalBaseQty += baseQty;
	}
	for (const { name, limit, totalBaseQty } of Object.values(byProduct)) {
		if (totalBaseQty > limit) {
			throw new AppError(
				`${name}: total base-unit qty ${totalBaseQty.toFixed(3)} exceeds available indent qty ${limit}`,
			);
		}
	}
}

function checkForDuplicateSerials(productItems) {
	const serialSet = new Set();
	const duplicateSerials = [];
	for (const item of productItems) {
		if (item.stock_type === 'serial' && item.selectedSerials) {
			for (const serial of item.selectedSerials) {
				if (serialSet.has(serial)) {
					duplicateSerials.push(serial);
					return { status: true, duplicateSerials }; // Duplicate found
				}
				serialSet.add(serial);
			}
		}
	}
	return { status: false, duplicateSerials }; // No duplicates
}

exports.generateInvoiceHtml = async (req) => {
	try {
		const { id } = req.params;
		const { copies = [] } = req.body;

		const purchaseOrder = await purchaseOrderRepository.findById(id, {
			include: [
				{
					model: PurchaseOrderItem,
					as: 'items',
				},
				{ model: MasterTermsCondition, as: 'priceTerm' },
				{ model: MasterTermsCondition, as: 'gstTerm' },
				{ model: MasterTermsCondition, as: 'paymentTerm' },
				{ model: MasterTermsCondition, as: 'deliveryTerm' },
				{ model: MasterTermsCondition, as: 'pfTerm' },
				{ model: MasterTermsCondition, as: 'ldClauseTerm' },
				{ model: Indent, as: 'indent', include: [{ model: MasterUnit, as: 'unit' }, { model: MasterPlaceOfUse, as: 'placeOfUse' }] },
			],
		});

		if (!purchaseOrder)
			return res.status(404).json({ message: 'Purchase order not found' });

		const response = await calculateSaleInvoice(purchaseOrder);
		logger.debug('response ', response);
		// return
		const copyTitles = {
			original: 'ORIGINAL FOR RECIPIENT',
			duplicate: 'DUPLICATE COPY',
			transport: 'DUPLICATE FOR TRANSPORTER',
			office: 'TRIPLICATE FOR SUPPLIER',
		};

		if (copies.length === 0) copies.push('original'); // default

		const htmlParts = await Promise.all(
			copies.map((copy) => {
				const title = copyTitles[copy] || 'INVOICE COPY';
				return generateInvoiceHTML({ ...response, copyTitle: title }, 'defaultTemplate');
			}),
		);

		const combinedHtml = htmlParts
			.map((html) => `<div class="preview-page">\n${html}\n</div>`)
			.join('\n');

		return combinedHtml;
	} catch (err) {
		console.error(err);
		throw new AppError('Failed to generate HTML');
	}
};

async function calculateSaleInvoice(invoice) {
	// const serialsData = await ProductSerial.findAll();
	// const batchData = await ProductBatch.findAll();
	const invoiceData = invoice.get({ plain: true });

	// return;
	const totalTaxableAmount = invoiceData.items.reduce((sum, item) => {
		const priceAfterDiscount =
			item.discount_price_type === 'percentage'
				? item.price - (item.price * item.discount) / 100
				: item.price - item.discount;
		return sum + priceAfterDiscount * parseFloat(item.qty);
	}, 0);

	const totalCgst = invoiceData.same_state
		? invoiceData.items.reduce(
				(sum, item) => sum + parseFloat(item.cgst || 0),
				0,
			)
		: 0;
	const totalSgst = invoiceData.same_state
		? invoiceData.items.reduce(
				(sum, item) => sum + parseFloat(item.sgst || 0),
				0,
			)
		: 0;
	const totalIgst = !invoiceData.same_state
		? invoiceData.items.reduce(
				(sum, item) => sum + parseFloat(item.igst || 0),
				0,
			)
		: 0;

	const [state, userData] = await Promise.all([
		getState(invoiceData.vendorInfo.state_id),
		User.findOne({
			where: { org_id: invoiceData.org_id },
			include: [
				{
					model: organization,
					as: 'organization',
				},
				{
					model: Role,
					as: 'userRoles',
					through: { attributes: [] },
					attributes: ['id', 'name', 'code'],
					where: { code: 'org_admin' },
				},
			],
		}),
	]);

	let businessLogo = null;
	let business = null;
	const unit = invoiceData.indent?.unit;
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
			${business.city || ''} - ${business.pincode || ''}, ${
				business?._state?.state_name || ''
			}<br>`;
	}
	if (userData?.logo) {
		businessLogo = await getImageAsBase64DataUrl(userData.logo);
	}
	console.log('invoiceData.items ', invoiceData.items);
	const orderReferenceNote =
		'With reference to your quotation we are pleased to place an order with you for the supply of the undernoted materials as per instructions specified below subject to general terms and conditions as mentioned below.';
	const response = {
		...invoiceData,
		businessLogo,
		business,
		orderReferenceNote,
		dueDate: formatExportDate(invoiceData.dueDate),
		poDetail: {
			...invoiceData.poDetail,
			date: formatExportDate(invoiceData.poDetail?.date),
		},
		vendorInfo: {
			...invoiceData.vendorInfo,
			state_name: `${state?.state_name} (${state?.gst_code})` || 'N/A',
		},
		productItems: invoiceData.items.map((item) => {
			const snapshot = item.productSnapshot;
			console.log('snapshot ', snapshot);
			return {
				...item,
				item_type: snapshot.item_type,
				product_name: snapshot.name,
				batches: [],
				// serials: serialsData?.map((s) => ({
				// 	...s,
				// 	label: s.serial_no,
				// 	value: s.id.toString(),
				// 	key: s.id.toString(),
				// })) || [],
				// selectedSerials: item.serials?.map((serial) => serial.serial_no) || [],
				// stockQty: (() => {
				// 	if (item.productSnapshot.stock_type === 'normal') {
				// 		return item.product.available_qty || 1;
				// 	} else if (item.productSnapshot.stock_type === 'batch') {
				// 		return batchData ? batchData.length : 0;
				// 	} else if (item.productSnapshot.stock_type === 'serial') {
				// 		// const totalSerials = serialsData.filter(
				// 		// 	(s) => s.product_id === item.product_id && s.is_sell === 0
				// 		// ).length;
				// 		return serialsData ? serialsData.length : 0;
				// 	}
				// 	return 0;
				// })(),
				taxRate: (() => {
					const rate = item.taxSnapshot?.rate ?? item.tax?.rate;
					if (invoiceData.same_state) {
						return rate ? rate / 2 : '0';
					} else {
						return rate ?? '0';
					}
				})(),
				totalTaxable: (() => {
					const priceAfterDiscount =
						item.discount_price_type === 'percentage'
							? item.price - (item.price * item.discount) / 100
							: item.price - item.discount;
					return parseFloat(priceAfterDiscount * item.qty).toFixed(2);
				})(),
				itemDiscountPercentage: (() => {
					if (item.discount_price_type === 'percentage') {
						return parseFloat(item.discount).toFixed(2);
					} else if (item.discount_price_type === 'rupee') {
						const discountPercent = (item.discount / item.price) * 100 || 0;
						return parseFloat(discountPercent).toFixed(2);
					}
					return '0.00';
				})(),
				uomDisplay: item.uomSnapshot?.unit?.name || item.uomSnapshot?.unit?.code || item.productSnapshot?.baseUnit?.name || item.productSnapshot?.baseUnit?.code || 'N/A',
			};
		}),
		additionalRemarks: invoiceData.remarks,
		combineInvoiceNumber: `${invoiceData.poPrefix || ''}${
			invoiceData.poNo || ''
		}${invoiceData.poPostfix || ''}`,
		totalCgst,
		totalSgst,
		totalIgst,
		totalDiscountAmount: invoiceData.items.reduce((sum, item) => {
			if (item.discount_price_type === 'percentage') {
				const discountAmount =
					((item.price * item.discount) / 100) * parseFloat(item.qty);
				return sum + discountAmount;
			} else if (item.discount_price_type === 'rupee') {
				const discountAmount = parseFloat(item.discount) * parseFloat(item.qty);
				return sum + discountAmount;
			}
			return sum;
		}, 0),
		totalQuantity: invoiceData.items.reduce(
			(sum, item) => sum + parseFloat(item.qty),
			0,
		),
		totalTaxableAmount,
		customField1: (() => {
			const field = invoiceData.customFields[0];
			if (!field) return null;

			let baseAmount =
				totalTaxableAmount +
				(invoiceData.same_state ? totalCgst + totalSgst : totalIgst);

			let calculatedValue = 0;
			if (field.valueType === 'percentage') {
				calculatedValue = (baseAmount * parseFloat(field.amount || 0)) / 100;
			} else if (field.valueType === 'rupee') {
				calculatedValue = parseFloat(field.amount || 0);
			}

			return {
				label: field.name,
				value: field.amount,
				valueType: field.valueType,
				operationType: field.operationType,
				calculatedValue: calculatedValue.toFixed(2),
			};
		})(),
		customField2: (() => {
			const field = invoiceData.customFields[1];
			if (!field) return null;

			let baseAmount =
				totalTaxableAmount +
				(invoiceData.same_state ? totalCgst + totalSgst : totalIgst);

			let calculatedValue = 0;
			if (field.valueType === 'percentage') {
				calculatedValue = (baseAmount * parseFloat(field.amount || 0)) / 100;
			} else if (field.valueType === 'rupee') {
				calculatedValue = parseFloat(field.amount || 0);
			}

			return {
				label: field.name,
				value: field.amount,
				valueType: field.valueType,
				operationType: field.operationType,
				calculatedValue: calculatedValue.toFixed(2),
			};
		})(),
		termsAndConditions: [
			invoiceData.priceTerm && {
				label: 'Price Term',
				value: invoiceData.priceTerm.terms_type,
			},
			invoiceData.gstTerm && {
				label: 'GST Term',
				value: invoiceData.gstTerm.terms_type,
			},
			invoiceData.paymentTerm && {
				label: 'Payment Term',
				value: invoiceData.paymentTerm.terms_type,
			},
			invoiceData.deliveryTerm && {
				label: 'Delivery Term',
				value: invoiceData.deliveryTerm.terms_type,
			},
			invoiceData.pfTerm && {
				label: 'P&F Term',
				value: invoiceData.pfTerm.terms_type,
			},
			invoiceData.ldClauseTerm && {
				label: 'LD Clause Term',
				value: invoiceData.ldClauseTerm.terms_type,
			},
		].filter(Boolean),
	};

	return response;
}

async function getState(id) {
	const url = `${VCP_SERVICE_API_BASE_URL}states/${id}`;
	console.log('url ', url);

	// const token = req.cookies.accessToken;

	const response = await fetch(url, {
		method: 'GET',
		// headers: {
		// 	Authorization: `Bearer ${token}`,
		// },
	});

	const data = await response.json();

	return data || [];
}

const EXPORT_BATCH_SIZE = 200;

const safeFloat = (val, fallback = 0) => {
	const n = parseFloat(val);
	return isNaN(n) ? fallback : n;
};

const safeStr = (val) => (val == null ? '' : String(val));

const formatExportDate = (val) => {
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
};

const formatExportDateTime = (val) => {
	if (!val) return '';
	try {
		return new Date(val).toLocaleString('en-IN', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	} catch {
		return '';
	}
};

const resolveDiscountValue = (discount) => {
	if (discount == null) return 0;
	if (typeof discount === 'object') {
		return safeFloat(
			discount.discount_amount ?? discount.value ?? discount.amount ?? 0,
		);
	}
	return safeFloat(discount);
};

exports.exportPurchaseOrders = async (req) => {
	const { org_id, role } = req.user;

	if (!org_id && role !== 'Admin') {
		throw new AppError("You don't have access to this API.", 403);
	}

	const { from_date, to_date } = req.query;
	const whereClause = { org_id };

	if (from_date || to_date) {
		const fromDate = new Date(from_date);
		const toDate = new Date(to_date);
		if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
			throw new AppError('Invalid date range');
		}
		toDate.setHours(23, 59, 59, 999);
		whereClause.createdAt = { [Op.between]: [fromDate, toDate] };
	}

	const now = new Date();
	const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
	const fileName = `purchase_order_report_${ts}.xlsx`;
	const filePath = path.join(__dirname, `../../storage/purchase-orders/${fileName}`);

	// Standard workbook (not streaming) — full styling support including fills/fonts
	const workbook = new ExcelJS.Workbook();

	const YELLOW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFBF00' } };
	const HEADER_FONT = { bold: true, color: { argb: 'FF000000' } };
	const HEADER_ALIGN = { vertical: 'middle', horizontal: 'center', wrapText: true };
	const THIN_BORDER = {
		top: { style: 'thin', color: { argb: 'FF000000' } },
		left: { style: 'thin', color: { argb: 'FF000000' } },
		bottom: { style: 'thin', color: { argb: 'FF000000' } },
		right: { style: 'thin', color: { argb: 'FF000000' } },
	};

	const borderRow = (row, numCols) => {
		for (let c = 1; c <= numCols; c++) {
			row.getCell(c).border = THIN_BORDER;
		}
	};

	const styleHeaderRow = (sheet) => {
		const row = sheet.getRow(1);
		const numCols = sheet.columns.length;
		for (let c = 1; c <= numCols; c++) {
			const cell = row.getCell(c);
			cell.font = HEADER_FONT;
			cell.fill = YELLOW;
			cell.alignment = HEADER_ALIGN;
			cell.border = THIN_BORDER;
		}
		row.height = 22;
	};

	// ── Sheet 1: PO headers ──────────────────────────────────────────────────
	const poSheet = workbook.addWorksheet('Purchase Orders');
	poSheet.columns = [
		{ header: 'Sr. No.', key: 'sr', width: 8 },
		{ header: 'PO No.', key: 'poNo', width: 20 },
		{ header: 'Order Type', key: 'orderType', width: 16 },
		{ header: 'Vendor Name', key: 'vendorName', width: 32 },
		{ header: 'Vendor GSTIN', key: 'vendorGstin', width: 20 },
		// { header: 'Vendor Email', key: 'vendorEmail', width: 28 },
		{ header: 'Vendor Mobile', key: 'vendorMobile', width: 16 },
		{ header: 'PO Date', key: 'poDate', width: 14 },
		{ header: 'Due Date', key: 'dueDate', width: 14 },
		{ header: 'Taxable Amount (₹)', key: 'totalTaxable', width: 20 },
		{ header: 'Total Tax (₹)', key: 'totalTax', width: 16 },
		{ header: 'Discount (₹)', key: 'discount', width: 14 },
		{ header: 'Other Tax (₹)', key: 'otherTax', width: 14 },
		{ header: 'Grand Total (₹)', key: 'grandTotal', width: 18 },
		{ header: 'Total Paid (₹)', key: 'totalPaid', width: 16 },
		{ header: 'Outstanding (₹)', key: 'remaining', width: 16 },
		{ header: 'Payment Status', key: 'paymentStatus', width: 16 },
		{ header: 'Order Status', key: 'status', width: 14 },
		{ header: 'Same State (GST)', key: 'sameState', width: 18 },
		{ header: 'QC Required', key: 'qcCheck', width: 14 },
		{ header: 'Remarks', key: 'remarks', width: 35 },
		{ header: 'Payment Term (%)', key: 'paymentTermValue', width: 20 },
		{ header: 'Payment Term Amount (₹)', key: 'paymentTermAmount', width: 24 },
		{ header: 'Start Date', key: 'startDate', width: 14 },
		{ header: 'End Date', key: 'endDate', width: 14 },
		{ header: 'Retention (%)', key: 'retention', width: 14 },
		{ header: 'Retention Amount (₹)', key: 'retentionAmount', width: 22 },
		{ header: 'Created At', key: 'createdAt', width: 20 },
	];
	styleHeaderRow(poSheet);

	// ── Sheet 2: Line items ──────────────────────────────────────────────────
	const itemSheet = workbook.addWorksheet('Line Items');
	itemSheet.columns = [
		{ header: 'Sr. No.', key: 'sr', width: 8 },
		{ header: 'PO No.', key: 'poNo', width: 20 },
		{ header: 'Order Type', key: 'orderType', width: 16 },
		{ header: 'Vendor Name', key: 'vendorName', width: 32 },
		{ header: 'Product Name', key: 'productName', width: 38 },
		{ header: 'Product Code', key: 'productCode', width: 18 },
		{ header: 'HSN / SAC Code', key: 'hsnCode', width: 18 },
		{ header: 'UOM', key: 'uom', width: 12 },
		{ header: 'Qty', key: 'qty', width: 10 },
		{ header: 'Rate (₹)', key: 'price', width: 14 },
		{ header: 'Discount', key: 'discount', width: 12 },
		{ header: 'Discount Type', key: 'discountType', width: 14 },
		{ header: 'IGST (%)', key: 'igst', width: 12 },
		{ header: 'CGST (%)', key: 'cgst', width: 12 },
		{ header: 'SGST (%)', key: 'sgst', width: 12 },
		{ header: 'CESS (%)', key: 'cess', width: 12 },
		{ header: 'Line Total (₹)', key: 'total', width: 16 },
		{ header: 'Budget No.', key: 'budgetNo', width: 16 },
		{ header: 'Note', key: 'note', width: 28 },
		{ header: 'Specification', key: 'specification', width: 28 },
	];
	styleHeaderRow(itemSheet);

	const poColCount = poSheet.columns.length;
	const itemColCount = itemSheet.columns.length;

	// ── Paginated DB fetch ───────────────────────────────────────────────────
	let offset = 0;
	let poSrNo = 1;
	let itemSrNo = 1;

	for (;;) {
		const batch = await PurchaseOrder.findAll({
			where: whereClause,
			attributes: [
				'id', 'poPrefix', 'poNo', 'poPostfix', 'poDetail', 'vendorInfo',
				'dueDate', 'grandTotal', 'total_taxable', 'total_tax', 'discount',
				'otherTax', 'totalPaid', 'remainingAmount', 'paymentStatus', 'status',
				'same_state', 'po_qc_check', 'orderType', 'start_date', 'end_date',
				'retention', 'retention_amount', 'remarks',
				'payment_term_value', 'payment_term_amount', 'createdAt',
			],
			include: [
				{
					model: PurchaseOrderItem,
					as: 'items',
					attributes: [
						'productSnapshot', 'uomSnapshot', 'hsn_sac_code',
						'qty', 'price', 'discount', 'discount_price_type',
						'igst', 'cgst', 'sgst', 'cess', 'total',
						'note', 'specification', 'budget_no',
					],
				},
			],
			order: [['createdAt', 'DESC']],
			limit: EXPORT_BATCH_SIZE,
			offset,
		});

		if (!batch || batch.length === 0) break;

		for (const poInstance of batch) {
			const po = poInstance.get({ plain: true });

			const poNumber = `${safeStr(po.poPrefix)}${safeStr(po.poNo)}${safeStr(po.poPostfix)}`;
			const vendorInfo = po.vendorInfo ?? {};
			const vendorName = safeStr(vendorInfo.vendor_name ?? vendorInfo.name ?? '');
			const vendorGstin = safeStr(vendorInfo.gstin ?? vendorInfo.gst_no ?? '');
			// const vendorEmail = safeStr(vendorInfo.email ?? '');
			const vendorMobile = safeStr(vendorInfo.contactNo ?? vendorInfo.phone ?? '');
			const poDetail = po.poDetail ?? {};
			const poDate = formatExportDate(poDetail.date ?? po.createdAt);
			const orderTypeLabel = safeStr(po.orderType ?? '').replace(/_/g, ' ').toUpperCase();
			const discountAmt = resolveDiscountValue(po.discount);
			const otherTaxAmt = resolveDiscountValue(po.otherTax);

			borderRow(poSheet.addRow({
				sr: poSrNo++,
				poNo: poNumber,
				orderType: orderTypeLabel,
				vendorName,
				vendorGstin,
				// vendorEmail,
				vendorMobile,
				poDate,
				dueDate: formatExportDate(po.dueDate),
				totalTaxable: safeFloat(po.total_taxable),
				totalTax: safeFloat(po.total_tax),
				discount: discountAmt,
				otherTax: otherTaxAmt,
				grandTotal: safeFloat(po.grandTotal),
				totalPaid: safeFloat(po.totalPaid),
				remaining: safeFloat(po.remainingAmount),
				paymentStatus: safeStr(po.paymentStatus),
				status: safeStr(po.status).toUpperCase(),
				sameState: po.same_state ? 'Yes' : 'No',
				qcCheck: po.po_qc_check ? 'Yes' : 'No',
				remarks: safeStr(po.remarks),
				paymentTermValue: po.payment_term_value != null ? safeFloat(po.payment_term_value) : '',
				paymentTermAmount: po.payment_term_amount != null ? safeFloat(po.payment_term_amount) : '',
				startDate: formatExportDate(po.start_date),
				endDate: formatExportDate(po.end_date),
				retention: po.retention != null ? safeFloat(po.retention) : '',
				retentionAmount: po.retention_amount != null ? safeFloat(po.retention_amount) : '',
				createdAt: formatExportDateTime(po.createdAt),
			}), poColCount);

			for (const item of (po.items ?? [])) {
				const snap = item.productSnapshot ?? {};
				const uomSnap = item.uomSnapshot ?? {};
				const productName = safeStr(snap.name ?? '');
				const productCode = safeStr(snap.uniqueProductId ?? snap.product_code ?? snap.sku ?? '');
				const hsnCode = safeStr(item.hsn_sac_code ?? snap.hsn_code ?? snap.hsn_sac_code ?? '');
				const uomCode = safeStr(uomSnap.unit?.name ?? uomSnap.unit?.code ?? uomSnap.code ?? uomSnap.name ?? uomSnap.short_name ?? snap.baseUnit?.name ?? snap.baseUnit?.code ?? '');

				borderRow(itemSheet.addRow({
					sr: itemSrNo++,
					poNo: poNumber,
					orderType: orderTypeLabel,
					vendorName,
					productName,
					productCode,
					hsnCode,
					uom: uomCode,
					qty: safeFloat(item.qty),
					price: safeFloat(item.price),
					discount: safeFloat(item.discount),
					discountType: safeStr(item.discount_price_type ?? ''),
					igst: safeFloat(item.igst),
					cgst: safeFloat(item.cgst),
					sgst: safeFloat(item.sgst),
					cess: safeFloat(item.cess),
					total: safeFloat(item.total),
					budgetNo: safeStr(item.budget_no ?? ''),
					note: safeStr(item.note ?? ''),
					specification: safeStr(item.specification ?? ''),
				}), itemColCount);
			}
		}

		offset += EXPORT_BATCH_SIZE;
		if (batch.length < EXPORT_BATCH_SIZE) break;
	}

	await workbook.xlsx.writeFile(filePath);

	const baseUrl = BASE_URL || 'http://localhost:4300';
	return {
		fileName,
		path: `${baseUrl}/storage/purchase-orders/${fileName}`,
	};
};

exports.submitPurchaseOrder = async (req, id) => {
	const po = await fetchPurchaseOrderForWorkflow(id);
	if (po.status !== 'draft') {
		throw new AppError('Only draft Purchase Orders can be submitted for approval', StatusCodes.BAD_REQUEST);
	}

	const transaction = await sequelize.transaction();
	try {
		const instance = await workflowEngine.startInstance({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: po.id,
			orgId: po.org_id,
			transaction,
		});

		await po.update({ status: instance.status }, { transaction });

		for (const item of po.items) {
			logger.debug("PO Item Qty Deduction", {
				qty: -parseFloat(item.qty),
				indent_id: po.indent_id,
				product_id: item.product_id,
				selected_uom_id: item.selected_uom_id ?? null,
			});
			await applyIndentQtyDelta(
				-parseFloat(item.qty),
				po.indent_id,
				item.product_id,
				item.selected_uom_id ?? null,
				transaction,
			);
		}

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: id,
			action: 'submitted',
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchPurchaseOrderForWorkflow(id);
};

exports.approvePurchaseOrder = async (req, id, remarks) => {
	const po = await fetchPurchaseOrderForWorkflow(id);
	await poWorkflow.assertCanAct(req, po);

	const stageNameBeforeAction = (
		await workflowEngine.getInstanceWithStages({ documentType: DOCUMENT_TYPE, documentId: id })
	).instance.currentStage?.stage_name ?? null;

	const transaction = await sequelize.transaction();
	try {
		const instance = await workflowEngine.advanceStage({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: id,
			action: 'approved',
			transaction,
		});

		await po.update(
			{
				status: instance.status,
				approved_by: { id: req.user.id, name: req.user.name, email: req.user.email },
				approved_at: new Date(),
			},
			{ transaction },
		);

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: id,
			action: 'approved',
			remarks,
			workflowStageName: stageNameBeforeAction,
			transaction,
		});

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}

	return fetchPurchaseOrderForWorkflow(id);
};

exports.rejectPurchaseOrder = async (req, id, remarks) => {
	return poWorkflow.reject(req, id, remarks);
};

exports.cancelPurchaseOrder = async (req, id, remarks) => {
	if (!remarks || !remarks.trim()) {
		throw new AppError('A cancellation reason is required', StatusCodes.BAD_REQUEST);
	}

	const po = await fetchPurchaseOrderForWorkflow(id);

	// Draft POs have no workflow instance (never submitted) — cancel directly
	if (po.status === 'draft') {
		const transaction = await sequelize.transaction();
		try {
			await po.update({ status: 'cancelled', cancellation_remarks: remarks }, { transaction });
			await auditLogService.record({
				req,
				entityType: DOCUMENT_TYPE,
				entityId: id,
				action: 'cancelled',
				remarks,
				transaction,
			});
			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			throw error;
		}
		return fetchPurchaseOrderForWorkflow(id);
	}

	return poWorkflow.cancel(req, id, remarks);
};

exports.reopenPurchaseOrder = async (req, id, remarks) => {
	return poWorkflow.reopen(req, id, remarks);
};

exports.archivePurchaseOrder = async (req, id, remarks) => {
	return poWorkflow.archive(req, id, remarks);
};

exports.restorePurchaseOrder = async (req, id, remarks) => {
	return poWorkflow.restore(req, id, remarks);
};

exports.getPurchaseOrderWorkflow = async (req, id) => {
	return poWorkflow.getWorkflow(req, id);
};
