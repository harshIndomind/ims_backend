const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const {
	workOrderRepository,
	workOrderItemsRepository,
	IndentItemRepository,
} = require('../repository/index');
const logger = require('../utils/logger');
const { sequelize } = require('../models/index');
const { Op } = require('sequelize');
const {
	WorkOrder,
	WorkOrderItem,
	Indent,
	IndentItem,
	User,
	organization,
	Role,
	PaymentRequisition,
	MasterTermsCondition,
	MasterUnit,
	Department,
	MasterPlaceOfUse,
} = require('../models/index');
const workflowEngine = require('./workflowEngine.service');
const auditLogService = require('./auditLog.service');
const indentQtyLogService = require('./indentQtyLog.service');
const { createWorkflowDocumentService } = require('./workflowDocument.factory');
const orderDispatchService = require('./orderDispatch.service');
const { generateDocumentNumber } = require('./document-numbering.service');
const { resolveUnitAndMajorHeadCodes } = require('./document-header-codes.service');

const DOCUMENT_TYPE = 'work_order';

async function fetchWorkOrderForWorkflow(id) {
	const wo = await workOrderRepository.findOne({
		where: { id },
		include: [
			{ model: WorkOrderItem, as: 'items' },
			{ model: Indent, as: 'indent', attributes: ['id', 'unit_id', 'department_id'] },
		],
	});
	if (!wo) throw new AppError(`Work Order with ID ${id} not found`, StatusCodes.NOT_FOUND);
	return wo;
}

const woWorkflow = createWorkflowDocumentService({
	documentType: DOCUMENT_TYPE,
	fetchById: (id) => fetchWorkOrderForWorkflow(id),
});
const {
	generateInvoiceHTMLPDF,
	generateInvoiceHTML,
} = require('../pdf/htmlPdfGenerator');
const { fetch } = require('undici');
const { VCP_SERVICE_API_BASE_URL, BASE_URL } = require('../config/serverConfig');
const { generateSignedUrl, getImageAsBase64DataUrl } = require('../utils/s3Bucket');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs/promises');
const { existsSync } = require('node:fs');

// Services have no stock and carry qty_for_purchase_order = 0 on the indent,
// so they must be excluded from the purchase-order qty ledger (otherwise the
// decrement drives the indent item negative).
const isServiceItem = (item) =>
	(item?.productSnapshot?.item_type ?? item?.item_type) === 'service';

// Same increment pattern as purchase-order.service.js's applyIndentQtyDelta, but keyed by
// indent_id + product_id only (no selected_uom_id disambiguation — matches the pre-existing
// lookup at every WO create/update/delete call site below). Exported so short-close.service.js
// can reuse this exact lookup/increment when releasing qty back to the indent on WO Short
// Close approval, rather than re-implementing it.
async function applyIndentQtyDeltaForWorkOrder(qtyDelta, indent_id, product_id, transaction, meta = {}) {
	const row = await IndentItem.findOne({ where: { indent_id, product_id }, transaction });
	if (!row) return;
	const previousValue = parseFloat(row.qty_for_purchase_order || 0);
	await IndentItemRepository.increment(
		{ qty_for_purchase_order: qtyDelta },
		{ where: { indent_id, product_id }, transaction },
	);
	if (meta.source) {
		await indentQtyLogService.record({
			req: meta.req,
			indentItemId: row.id,
			indentId: indent_id,
			productId: product_id,
			field: 'qty_for_purchase_order',
			delta: qtyDelta,
			previousValue,
			newValue: previousValue + qtyDelta,
			source: meta.source,
			sourceRefId: meta.sourceRefId,
			transaction,
		});
	}
}
exports.applyIndentQtyDeltaForWorkOrder = applyIndentQtyDeltaForWorkOrder;

exports.createWorkOrder = async (req) => {
	const transaction = await sequelize.transaction();
	try {
		const { org_id } = req.user;

		// Preserves the role gate that used to live in the now-removed generate-wo-number
		// "peek" endpoint — checkPermission('work-order', 'create') alone isn't enough
		// since it bypasses everything for super_admin.
		if (
			!req.user.org_id ||
			(!req.user.roles.includes('org_admin') && !req.user.roles.includes('app_admin'))
		) {
			const errorMsg = req.user.role === 'Super Admin'
				? "As a super admin user you can't create a work order."
				: 'Invalid user or organization ID';
			throw new AppError(errorMsg, 403);
		}

		const {
			indent_id,
			wo_qc_check,
			dueDate,
			total_taxable,
			total_tax,
			isRoundOff,
			grandTotal,
			payment_type,
			additionalRemarks,
			state_same,
			vendorInfo,
			workOrderDetail,
			productItems,
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
			payment_term_amount,
			delivery_term_days,
			bankSnapshot
		} = req.body;

		for (const item of productItems) {
			if (isServiceItem(item)) continue;
			if (Number(item.qty) > Number(item.qty_for_purchase_order)) {
				throw new AppError(
					`${item.productSnapshot.name} qty ${item.qty} should not be greater than W.O Order qty ${item.qty_for_purchase_order}`,
				);
			}
		}

		const { unitShortCode, majorHeadCode } = await resolveUnitAndMajorHeadCodes({
			indentId: indent_id,
			productItems,
			transaction,
		});
		const { docNumber, sequenceNo, fiscalYear } = await generateDocumentNumber({
			orgId: org_id,
			docType: 'WO',
			unitShortCode,
			majorHeadCode,
			transaction,
		});

		const woObject = {
			org_id,
			indent_id,
			vendorId: vendorInfo.vendor_id || null,
			dueDate,
			doc_number: docNumber,
			doc_sequence_no: sequenceNo,
			doc_fiscal_year: fiscalYear,
			total_taxable: parseFloat(total_taxable || 0),
			total_tax: parseFloat(total_tax || 0),
			grandTotal: parseFloat(grandTotal || 0),
			bankSnapshot,
			isRoundOff,
			paymentType: payment_type,
			vendorInfo,
			woDetail: workOrderDetail,
			additionalNotes,
			customFields: [customField1, customField2],
			remarks: additionalRemarks,
			same_state: state_same,
			status: 'draft',
			remainingAmount: grandTotal,
			wo_qc_check,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
			payment_term_value,
			payment_term_amount,
			start_date: workOrderDetail.start_date || null,
			end_date: workOrderDetail.end_date || null,
			retention:
				workOrderDetail.retention != null
					? parseFloat(workOrderDetail.retention)
					: null,
			retention_amount:
				workOrderDetail.retention != null
					? parseFloat(
							(
								(parseFloat(workOrderDetail.retention) / 100) *
								parseFloat(grandTotal || 0)
							).toFixed(2),
						)
					: null,
			delivery_term_days
		};

		const workOrder = await workOrderRepository.create(woObject, { transaction });

		await auditLogService.record({
			req,
			entityType: DOCUMENT_TYPE,
			entityId: workOrder.id,
			action: 'create',
			newState: { doc_number: woObject.doc_number },
			transaction,
		});

		for (const item of productItems) {
			const woItemObject = {
				work_order_id: workOrder.id,
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
					Number(item.selected_uom_id) > 0 ? Number(item.selected_uom_id) : null,
				specification: item.specification,
			};

			await workOrderItemsRepository.create(woItemObject, { transaction });

			if (!isServiceItem(item)) {
				await applyIndentQtyDeltaForWorkOrder(-parseFloat(item.qty), indent_id, item.product_id, transaction, {
					req,
					source: 'wo_created',
					sourceRefId: workOrder.id,
				});
			}
		}

		await transaction.commit();
		return workOrder;
	} catch (error) {
		await transaction.rollback();
		console.error(error);
		throw error;
	}
};

exports.updateWorkOrder = async (req) => {
	const { id } = req.params;
	const transaction = await sequelize.transaction();

	try {
		const {
			indent_id,
			wo_qc_check,
			dueDate,
			total_taxable,
			total_tax,
			isRoundOff,
			grandTotal,
			payment_type,
			additionalRemarks,
			state_same,
			vendorInfo,
			workOrderDetail,
			productItems,
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
			payment_term_amount,
			delivery_term_days,
			bankSnapshot
		} = req.body;

		for (const item of productItems) {
			if (isServiceItem(item)) continue;
			if (Number(item.qty) > Number(item.qty_for_purchase_order)) {
				throw new AppError(
					`${item.productSnapshot.name} qty ${item.qty} should not be greater than W.O Order qty ${item.qty_for_purchase_order}`,
				);
			}
		}

		const workOrder = await workOrderRepository.findById(id, { transaction });
		if (!workOrder) {
			throw new AppError('Work order not found.');
		}

		const woObject = {
			indent_id,
			vendorId: vendorInfo.vendor_id || null,
			dueDate,
			bankSnapshot,
			woPrefix: workOrderDetail.woPrefix || null,
			woNo: workOrderDetail.woNumber || null,
			woPostfix: workOrderDetail.woPostfix || null,
			total_taxable: parseFloat(total_taxable || 0),
			total_tax: parseFloat(total_tax || 0),
			grandTotal: parseFloat(grandTotal || 0),
			isRoundOff,
			paymentType: payment_type,
			vendorInfo,
			woDetail: workOrderDetail,
			additionalNotes,
			customFields: [customField1, customField2],
			remarks: additionalRemarks,
			same_state: state_same,
			remainingAmount: grandTotal,
			wo_qc_check,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
			payment_term_value,
			payment_term_amount,
			start_date: workOrderDetail.start_date || null,
			end_date: workOrderDetail.end_date || null,
			retention:
				workOrderDetail.retention != null
					? parseFloat(workOrderDetail.retention)
					: null,
			retention_amount:
				workOrderDetail.retention != null
					? parseFloat(
							(
								(parseFloat(workOrderDetail.retention) / 100) *
								parseFloat(grandTotal || 0)
							).toFixed(2),
						)
					: null,
			delivery_term_days
		};

		await workOrderRepository.update(workOrder, woObject, { transaction });

		for (const item of productItems) {
			const woItemObject = {
				work_order_id: workOrder.id,
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
					Number(item.selected_uom_id) > 0 ? Number(item.selected_uom_id) : null,
				specification: item.specification,
			};

			const existingItem = await workOrderItemsRepository.findOne({
				where: {
					work_order_id: workOrder.id,
					product_id: item.product_id,
				},
				transaction,
			});

			if (!existingItem) {
				throw new AppError('Work order item not found.');
			}

			if (!isServiceItem(item)) {
				await applyIndentQtyDeltaForWorkOrder(parseFloat(existingItem.qty), indent_id, item.product_id, transaction, {
					req,
					source: 'wo_updated',
					sourceRefId: workOrder.id,
				});
			}

			await workOrderItemsRepository.update(existingItem, woItemObject, {
				transaction,
			});

			if (!isServiceItem(item)) {
				await applyIndentQtyDeltaForWorkOrder(-parseFloat(item.qty), indent_id, item.product_id, transaction, {
					req,
					source: 'wo_updated',
					sourceRefId: workOrder.id,
				});
			}
		}

		await transaction.commit();
		return workOrder;
	} catch (error) {
		await transaction.rollback();
		console.error(error);
		throw error;
	}
};

/**
 * Shared by getAllWorkOrders (list) and exportWorkOrders (Excel) — see the matching comment
 * in purchase-order.service.js's buildPurchaseOrderFilters for why this is factored out.
 */
function buildWorkOrderFilters(req) {
	const { org_id } = req.user;
	const { from_date, to_date, unit_id, due_date_from, due_date_to, payment_status, dispatch_status_filter } = req.query;

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

	// See the matching comment in purchase-order.service.js's getAllPurchaseOrders —
	// 'pending_dispatch' requires status === 'approved' too, not just the raw column value.
	if (dispatch_status_filter === 'pending_dispatch') {
		andConditions.push({ status: 'approved', dispatch_status: 'not_dispatched' });
	} else if (dispatch_status_filter === 'pending_acknowledgement') {
		andConditions.push({ dispatch_status: 'dispatched' });
	}

	return { andConditions, unitId: unit_id ? Number(unit_id) : null };
}

exports.getAllWorkOrders = async (req) => {
	const { org_id, role } = req.user;
	const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
	const offset = req.query.offset ? parseInt(req.query.offset) : undefined;

	if (!org_id && role !== 'Admin') {
		throw new AppError(`You don't authorize to access this api.`);
	}

	const { andConditions, unitId } = buildWorkOrderFilters(req);

	const findOptions = {
		where: { [Op.and]: andConditions },
		attributes: [
			'id',
			'woPrefix',
			'woNo',
			'woPostfix',
			'doc_number',
			'dueDate',
			'grandTotal',
			'totalPaid',
			'remainingAmount',
			'woDetail',
			'status',
			'createdAt',
			'paymentStatus',
			'vendorInfo',
			'dispatch_status',
			'wo_qc_check',
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
				where: unitId ? { unit_id: unitId } : undefined,
				required: !!unitId,
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

	const workOrders = await workOrderRepository.findAll(findOptions);

	const response = workOrders.rows.map((wo) => wo.get({ plain: true }));
	return { rows: response, count: workOrders.count };
};

exports.getWorkOrderById = async (req) => {
	const { id } = req.params;
	const { org_id, role } = req.user;

	if (!org_id && role !== 'Admin') {
		throw new AppError(`You don't authorize to access this api.`);
	}

	const workOrder = await workOrderRepository.findOne({
		where: { id, org_id },
		include: [
			{
				model: WorkOrderItem,
				as: 'items',
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

	if (!workOrder) {
		throw new AppError('Work order not found', StatusCodes.NOT_FOUND);
	}

	const woDetail = workOrder.get({ plain: true });

	return {
		...woDetail,
		productItems: woDetail.items.map((item) => ({
			...item,
			item_type: item.productSnapshot.item_type,
			product_name: item.productSnapshot.name,
			batches: [],
			serials: [],
			stockQty: item.qty,
		})),
		additionalRemarks: woDetail.remarks,
	};
};

exports.deleteWorkOrder = async (req) => {
	const { id } = req.params;
	const { org_id, role } = req.user;

	if (!org_id && role !== 'Admin') {
		throw new AppError(`You don't authorize to access this api.`, 403);
	}

	const transaction = await sequelize.transaction();

	try {
		const workOrder = await workOrderRepository.findById(id, {
			include: [{ model: WorkOrderItem, as: 'items' }],
			transaction,
		});

		if (!workOrder) {
			await transaction.rollback();
			throw new AppError('Work Order not found', StatusCodes.NOT_FOUND);
		}

		for (const item of workOrder.items) {
			if (isServiceItem(item)) continue;
			await applyIndentQtyDeltaForWorkOrder(parseFloat(item.qty), workOrder.indent_id, item.product_id, transaction, {
				req,
				source: 'wo_deleted',
				sourceRefId: workOrder.id,
			});
		}

		await PaymentRequisition.destroy({ where: { wo_id: id }, transaction });

		const orderFileKeys = await orderDispatchService.deleteAllForDocument(DOCUMENT_TYPE, id, transaction);

		await workOrderRepository.delete(workOrder, { transaction });

		await transaction.commit();
		await orderDispatchService.cleanupS3Documents(orderFileKeys);
		return true;
	} catch (error) {
		if (transaction && !transaction.finished) {
			try {
				await transaction.rollback();
			} catch (rbErr) {
				console.error('rollback error', rbErr);
				throw rbErr;
			}
		}
		throw error;
	}
};

exports.generateInvoiceHtml = async (req) => {
	const { id } = req.params;
	const { copies = [] } = req.body;

	const workOrder = await workOrderRepository.findById(id, {
		include: [
			{ model: WorkOrderItem, as: 'items' },
			{ model: MasterTermsCondition, as: 'priceTerm' },
			{ model: MasterTermsCondition, as: 'gstTerm' },
			{ model: MasterTermsCondition, as: 'paymentTerm' },
			{ model: MasterTermsCondition, as: 'deliveryTerm' },
			{ model: MasterTermsCondition, as: 'pfTerm' },
			{ model: MasterTermsCondition, as: 'ldClauseTerm' },
			{ model: Indent, as: 'indent', include: [{ model: MasterUnit, as: 'unit' }, { model: MasterPlaceOfUse, as: 'placeOfUse' }] },
		],
	});

	if (!workOrder) throw new AppError('Work order not found', StatusCodes.NOT_FOUND);

	const response = await calculateWorkOrderInvoice(workOrder);

	const copyTitles = {
		original: 'ORIGINAL FOR RECIPIENT',
		duplicate: 'DUPLICATE COPY',
		transport: 'DUPLICATE FOR TRANSPORTER',
		office: 'TRIPLICATE FOR SUPPLIER',
	};

	if (copies.length === 0) copies.push('original');

	const htmlParts = await Promise.all(
		copies.map((copy) => {
			const title = copyTitles[copy] || 'INVOICE COPY';
			return generateInvoiceHTML({ ...response, copyTitle: title }, 'workOrderTemplate');
		}),
	);

	const combinedHtml = htmlParts
		.map((html) => `<div class="preview-page">\n${html}\n</div>`)
		.join('\n');

	return combinedHtml;
};

exports.downloadInvoicePdf = async (req) => {
	const { html = '' } = req.body;
	const pdfPath = await generateInvoiceHTMLPDF(html, 'workOrderTemplate', { multi: true });
	return pdfPath;
};

async function calculateWorkOrderInvoice(workOrder) {
	const invoiceData = workOrder.get({ plain: true });
	console.log("invoiceData ", invoiceData);
	const totalTaxableAmount = invoiceData.items.reduce((sum, item) => {
		const priceAfterDiscount =
			item.discount_price_type === 'percentage'
				? item.price - (item.price * item.discount) / 100
				: item.price - item.discount;
		return sum + priceAfterDiscount * parseFloat(item.qty);
	}, 0);

	const totalCgst = invoiceData.same_state
		? invoiceData.items.reduce((sum, item) => sum + parseFloat(item.cgst || 0), 0)
		: 0;
	const totalSgst = invoiceData.same_state
		? invoiceData.items.reduce((sum, item) => sum + parseFloat(item.sgst || 0), 0)
		: 0;
	const totalIgst = !invoiceData.same_state
		? invoiceData.items.reduce((sum, item) => sum + parseFloat(item.igst || 0), 0)
		: 0;

	const [state, orgRole] = await Promise.all([
		getState(invoiceData.vendorInfo?.state_id),
		Role.findOne({ where: { code: 'org_admin' }, attributes: ['id'] }),
	]);

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

	const orderReferenceNote =
		'We are pleased to award the Service Order as detailed below. This order no. and Date must be quoted in your bills and in all correspondence in this connection with this office/factory.';

	return {
		...invoiceData,
		businessLogo,
		business,
		orderReferenceNote,
		dueDate: formatExportDate(invoiceData.dueDate),
		start_date: formatExportDate(invoiceData.start_date),
		end_date: formatExportDate(invoiceData.end_date),
		woDetail: {
			...invoiceData.woDetail,
			date: formatExportDate(invoiceData.woDetail?.date),
		},
		vendorInfo: {
			...invoiceData.vendorInfo,
			state_name: state ? `${state.state_name} (${state.gst_code})` : 'N/A',
		},
		productItems: invoiceData.items.map((item) => {
			const snapshot = item.productSnapshot;
			console.log("snapshot ", snapshot);

			return {
				...item,
				item_type: snapshot?.item_type,
				product_name: snapshot?.name,
				uomDisplay: item.uomSnapshot?.unit?.name || item.uomSnapshot?.unit?.code || snapshot?.baseUnit?.name || snapshot?.baseUnit?.code || '',
				batches: [],
				serials: [],
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
						return parseFloat((item.discount / item.price) * 100 || 0).toFixed(2);
					}
					return '0.00';
				})(),
			};
		}),
		additionalRemarks: invoiceData.remarks,
		combineInvoiceNumber: invoiceData.doc_number || `${invoiceData.woPrefix || ''}${invoiceData.woNo || ''}${invoiceData.woPostfix || ''}`,
		totalCgst,
		totalSgst,
		totalIgst,
		totalDiscountAmount: invoiceData.items.reduce((sum, item) => {
			if (item.discount_price_type === 'percentage') {
				return sum + ((item.price * item.discount) / 100) * parseFloat(item.qty);
			} else if (item.discount_price_type === 'rupee') {
				return sum + parseFloat(item.discount) * parseFloat(item.qty);
			}
			return sum;
		}, 0),
		totalQuantity: invoiceData.items.reduce((sum, item) => sum + parseFloat(item.qty), 0),
		totalTaxableAmount,
		customField1: (() => {
			const field = invoiceData.customFields?.[0];
			if (!field) return null;
			const baseAmount =
				totalTaxableAmount + (invoiceData.same_state ? totalCgst + totalSgst : totalIgst);
			const calculatedValue =
				field.valueType === 'percentage'
					? (baseAmount * parseFloat(field.amount || 0)) / 100
					: parseFloat(field.amount || 0);
			return {
				label: field.name,
				value: field.amount,
				valueType: field.valueType,
				operationType: field.operationType,
				calculatedValue: calculatedValue.toFixed(2),
			};
		})(),
		customField2: (() => {
			const field = invoiceData.customFields?.[1];
			if (!field) return null;
			const baseAmount =
				totalTaxableAmount + (invoiceData.same_state ? totalCgst + totalSgst : totalIgst);
			const calculatedValue =
				field.valueType === 'percentage'
					? (baseAmount * parseFloat(field.amount || 0)) / 100
					: parseFloat(field.amount || 0);
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
}

async function getState(id) {
	if (!id) return null;
	const url = `${VCP_SERVICE_API_BASE_URL}states/${id}`;
	const response = await fetch(url, { method: 'GET' });
	const data = await response.json();
	return data || null;
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
			day: '2-digit', month: '2-digit', year: 'numeric',
		});
	} catch { return ''; }
};

const formatExportDateTime = (val) => {
	if (!val) return '';
	try {
		return new Date(val).toLocaleString('en-IN', {
			day: '2-digit', month: '2-digit', year: 'numeric',
			hour: '2-digit', minute: '2-digit',
		});
	} catch { return ''; }
};

exports.exportWorkOrders = async (req) => {
	const { org_id, role } = req.user;

	if (!org_id && role !== 'Admin') {
		throw new AppError("You don't have access to this API.", 403);
	}

	const { andConditions, unitId } = buildWorkOrderFilters(req);
	const whereClause = { [Op.and]: andConditions };

	const now = new Date();
	const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
	const fileName = `work_order_report_${ts}.xlsx`;
	const directory = path.join(__dirname, '../../storage/work-orders');

	if (!existsSync(directory)) {
		await fs.mkdir(directory, { recursive: true });
	}

	const filePath = path.join(directory, fileName);

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

	const woSheet = workbook.addWorksheet('Work Orders');
	woSheet.columns = [
		{ header: 'Sr. No.', key: 'sr', width: 8 },
		{ header: 'W.O. No.', key: 'woNo', width: 20 },
		{ header: 'Vendor Name', key: 'vendorName', width: 32 },
		{ header: 'Vendor GSTIN', key: 'vendorGstin', width: 20 },
		{ header: 'Vendor Mobile', key: 'vendorMobile', width: 16 },
		{ header: 'W.O. Date', key: 'woDate', width: 14 },
		{ header: 'Due Date', key: 'dueDate', width: 14 },
		{ header: 'Start Date', key: 'startDate', width: 14 },
		{ header: 'End Date', key: 'endDate', width: 14 },
		{ header: 'Taxable Amount (₹)', key: 'totalTaxable', width: 20 },
		{ header: 'Total Tax (₹)', key: 'totalTax', width: 16 },
		{ header: 'Grand Total (₹)', key: 'grandTotal', width: 18 },
		{ header: 'Total Paid (₹)', key: 'totalPaid', width: 16 },
		{ header: 'Outstanding (₹)', key: 'remaining', width: 16 },
		{ header: 'Payment Status', key: 'paymentStatus', width: 16 },
		{ header: 'Order Status', key: 'status', width: 14 },
		{ header: 'Dispatch Status', key: 'dispatchStatus', width: 16 },
		{ header: 'Acknowledge Status', key: 'acknowledgeStatus', width: 18 },
		{ header: 'Last Dispatch Date', key: 'lastDispatchedAt', width: 20 },
		{ header: 'Last Acknowledge Date', key: 'lastAcknowledgedAt', width: 22 },
		{ header: 'Same State (GST)', key: 'sameState', width: 18 },
		{ header: 'QC Required', key: 'qcCheck', width: 14 },
		{ header: 'Retention (%)', key: 'retention', width: 14 },
		{ header: 'Retention Amount (₹)', key: 'retentionAmount', width: 22 },
		{ header: 'Payment Term (%)', key: 'paymentTermValue', width: 20 },
		{ header: 'Payment Term Amount (₹)', key: 'paymentTermAmount', width: 24 },
		{ header: 'Remarks', key: 'remarks', width: 35 },
		{ header: 'Created At', key: 'createdAt', width: 20 },
	];
	styleHeaderRow(woSheet);

	const itemSheet = workbook.addWorksheet('Line Items');
	itemSheet.columns = [
		{ header: 'Sr. No.', key: 'sr', width: 8 },
		{ header: 'W.O. No.', key: 'woNo', width: 20 },
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

	const woColCount = woSheet.columns.length;
	const itemColCount = itemSheet.columns.length;

	let offset = 0;
	let woSrNo = 1;
	let itemSrNo = 1;

	for (;;) {
		const batch = await WorkOrder.findAll({
			where: whereClause,
			attributes: [
				'id', 'woPrefix', 'woNo', 'woPostfix', 'doc_number', 'woDetail', 'vendorInfo',
				'dueDate', 'grandTotal', 'total_taxable', 'total_tax',
				'totalPaid', 'remainingAmount', 'paymentStatus', 'status',
				'dispatch_status', 'last_dispatched_at', 'last_acknowledged_at',
				'same_state', 'wo_qc_check', 'start_date', 'end_date',
				'retention', 'retention_amount', 'remarks',
				'payment_term_value', 'payment_term_amount', 'createdAt',
			],
			include: [
				{
					model: WorkOrderItem,
					as: 'items',
					attributes: [
						'productSnapshot', 'uomSnapshot', 'hsn_sac_code',
						'qty', 'price', 'discount', 'discount_price_type',
						'igst', 'cgst', 'sgst', 'cess', 'total',
						'note', 'specification', 'budget_no',
					],
				},
				{
					model: Indent,
					as: 'indent',
					attributes: [],
					where: unitId ? { unit_id: unitId } : undefined,
					required: !!unitId,
				},
			],
			order: [['createdAt', 'DESC']],
			limit: EXPORT_BATCH_SIZE,
			offset,
		});

		if (!batch || batch.length === 0) break;

		for (const woInstance of batch) {
			const wo = woInstance.get({ plain: true });

			const woNumber = wo.doc_number || `${safeStr(wo.woPrefix)}${safeStr(wo.woNo)}${safeStr(wo.woPostfix)}`;
			const vendorInfo = wo.vendorInfo ?? {};
			const vendorName = safeStr(vendorInfo.vendor_name ?? vendorInfo.name ?? '');
			const vendorGstin = safeStr(vendorInfo.gstin ?? vendorInfo.gst_no ?? '');
			const vendorMobile = safeStr(vendorInfo.contactNo ?? vendorInfo.phone ?? '');
			const woDetail = wo.woDetail ?? {};
			const woDate = formatExportDate(woDetail.date ?? wo.createdAt);

			borderRow(woSheet.addRow({
				sr: woSrNo++,
				woNo: woNumber,
				vendorName,
				vendorGstin,
				vendorMobile,
				woDate,
				dueDate: formatExportDate(wo.dueDate),
				startDate: formatExportDate(wo.start_date),
				endDate: formatExportDate(wo.end_date),
				totalTaxable: safeFloat(wo.total_taxable),
				totalTax: safeFloat(wo.total_tax),
				grandTotal: safeFloat(wo.grandTotal),
				totalPaid: safeFloat(wo.totalPaid),
				remaining: safeFloat(wo.remainingAmount),
				paymentStatus: safeStr(wo.paymentStatus),
				status: safeStr(wo.status).toUpperCase(),
				dispatchStatus: wo.dispatch_status === 'not_dispatched' ? 'Not Dispatched' : 'Dispatched',
				acknowledgeStatus: { not_dispatched: '—', dispatched: 'Pending', acknowledged: 'Acknowledged' }[wo.dispatch_status] ?? '—',
				lastDispatchedAt: formatExportDateTime(wo.last_dispatched_at),
				lastAcknowledgedAt: formatExportDateTime(wo.last_acknowledged_at),
				sameState: wo.same_state ? 'Yes' : 'No',
				qcCheck: wo.wo_qc_check ? 'Yes' : 'No',
				retention: wo.retention != null ? safeFloat(wo.retention) : '',
				retentionAmount: wo.retention_amount != null ? safeFloat(wo.retention_amount) : '',
				paymentTermValue: wo.payment_term_value != null ? safeFloat(wo.payment_term_value) : '',
				paymentTermAmount: wo.payment_term_amount != null ? safeFloat(wo.payment_term_amount) : '',
				remarks: safeStr(wo.remarks),
				createdAt: formatExportDateTime(wo.createdAt),
			}), woColCount);

			for (const item of (wo.items ?? [])) {
				const snap = item.productSnapshot ?? {};
				const uomSnap = item.uomSnapshot ?? {};
				const productName = safeStr(snap.name ?? '');
				const productCode = safeStr(snap.uniqueProductId ?? snap.product_code ?? snap.sku ?? '');
				const hsnCode = safeStr(item.hsn_sac_code ?? snap.hsn_code ?? snap.hsn_sac_code ?? '');
				const uomCode = safeStr(uomSnap.unit?.name ?? uomSnap.unit?.code ?? uomSnap.code ?? uomSnap.name ?? uomSnap.short_name ?? snap.baseUnit?.name ?? snap.baseUnit?.code ?? '');

				borderRow(itemSheet.addRow({
					sr: itemSrNo++,
					woNo: woNumber,
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

	if (woSrNo === 1) {
		throw new AppError('No work orders found to export.', StatusCodes.NOT_FOUND);
	}

	await workbook.xlsx.writeFile(filePath);

	const baseUrl = BASE_URL || 'http://localhost:4300';
	return {
		fileName,
		path: `${baseUrl}/storage/work-orders/${fileName}`,
	};
};

exports.submitWorkOrder = async (req, id) => {
	const wo = await fetchWorkOrderForWorkflow(id);
	if (wo.status !== 'draft') {
		throw new AppError('Only draft Work Orders can be submitted for approval', StatusCodes.BAD_REQUEST);
	}

	const transaction = await sequelize.transaction();
	try {
		const instance = await workflowEngine.startInstance({
			req,
			documentType: DOCUMENT_TYPE,
			documentId: wo.id,
			orgId: wo.org_id,
			transaction,
		});

		await wo.update({ status: instance.status }, { transaction });

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

	return fetchWorkOrderForWorkflow(id);
};

exports.approveWorkOrder = async (req, id, remarks) => {
	const wo = await fetchWorkOrderForWorkflow(id);
	await woWorkflow.assertCanAct(req, wo);

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

		await wo.update(
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

	return fetchWorkOrderForWorkflow(id);
};

exports.rejectWorkOrder = async (req, id, remarks) => {
	return woWorkflow.reject(req, id, remarks);
};

exports.cancelWorkOrder = async (req, id, remarks) => {
	return woWorkflow.cancel(req, id, remarks);
};

exports.reopenWorkOrder = async (req, id, remarks) => {
	return woWorkflow.reopen(req, id, remarks);
};

exports.archiveWorkOrder = async (req, id, remarks) => {
	return woWorkflow.archive(req, id, remarks);
};

exports.restoreWorkOrder = async (req, id, remarks) => {
	return woWorkflow.restore(req, id, remarks);
};

exports.getWorkOrderWorkflow = async (req, id) => {
	const workflow = await woWorkflow.getWorkflow(req, id);
	const dispatchHistoryRows = await orderDispatchService.getMergedHistoryRows(DOCUMENT_TYPE, id);
	const history = [...workflow.history, ...dispatchHistoryRows].sort(
		(a, b) => new Date(a.createdAt) - new Date(b.createdAt),
	);
	return { ...workflow, history };
};

/**
 * Same server-side HTML→PDF pipeline as the PO equivalent (see purchase-order.service.js's
 * buildPurchaseOrderPdfBuffer) but through the 'workOrderTemplate' template.
 */
async function buildWorkOrderPdfBuffer(id) {
	const html = await exports.generateInvoiceHtml({ params: { id }, body: {} });
	const pdfUrl = await generateInvoiceHTMLPDF(html, 'workOrderTemplate', { multi: true });
	const relativePath = pdfUrl.split('/storage/')[1];
	if (!relativePath) return null;
	return fs.readFile(path.join(__dirname, '../../storage', relativePath));
}

exports.dispatchWorkOrder = async (req, id, payload) => {
	const wo = await fetchWorkOrderForWorkflow(id);
	if (wo.status !== 'approved') {
		throw new AppError('Only approved Work Orders can be dispatched', StatusCodes.BAD_REQUEST);
	}

	await orderDispatchService.dispatchDocument({
		req,
		documentType: DOCUMENT_TYPE,
		documentId: id,
		doc: wo,
		payload,
		generatePdfBuffer: () => buildWorkOrderPdfBuffer(id),
		documentLabel: wo.doc_number || `${wo.woPrefix || ''}${wo.woNo}${wo.woPostfix || ''}`,
	});

	return fetchWorkOrderForWorkflow(id);
};

exports.acknowledgeWorkOrder = async (req, id, payload, file) => {
	const wo = await fetchWorkOrderForWorkflow(id);
	if (wo.dispatch_status === 'not_dispatched') {
		throw new AppError('This Work Order has not been dispatched yet', StatusCodes.CONFLICT);
	}

	await orderDispatchService.acknowledgeDocument({
		req,
		documentType: DOCUMENT_TYPE,
		documentId: id,
		doc: wo,
		payload,
		file,
	});

	return fetchWorkOrderForWorkflow(id);
};

exports.listWorkOrderDispatches = async (id) => {
	await fetchWorkOrderForWorkflow(id);
	return orderDispatchService.listDispatches(DOCUMENT_TYPE, id);
};

exports.listWorkOrderAcknowledgements = async (id) => {
	await fetchWorkOrderForWorkflow(id);
	return orderDispatchService.listAcknowledgements(DOCUMENT_TYPE, id);
};
