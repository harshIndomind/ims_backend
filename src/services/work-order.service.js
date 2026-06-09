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
const { WorkOrder, WorkOrderItem, Indent, User, organization, Role, PaymentRequisition } = require('../models/index');
const {
	generateInvoiceHTMLPDF,
	generateInvoiceHTML,
} = require('../pdf/htmlPdfGenerator');
const { fetch } = require('undici');
const { VCP_SERVICE_API_BASE_URL, BASE_URL } = require('../config/serverConfig');
const { generateSignedUrl } = require('../utils/s3Bucket');
const ExcelJS = require('exceljs');
const path = require('path');

// Services have no stock and carry qty_for_purchase_order = 0 on the indent,
// so they must be excluded from the purchase-order qty ledger (otherwise the
// decrement drives the indent item negative).
const isServiceItem = (item) =>
	(item?.productSnapshot?.item_type ?? item?.item_type) === 'service';

exports.createWorkOrder = async (req) => {
	const transaction = await sequelize.transaction();
	try {
		const { org_id } = req.user;
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

		const woObject = {
			org_id,
			indent_id,
			vendorId: vendorInfo.vendor_id || null,
			dueDate,
			woPrefix: workOrderDetail.woPrefix || null,
			woNo: workOrderDetail.woNumber || null,
			woPostfix: workOrderDetail.woPostfix || null,
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
			status: 'pending',
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

		for (const item of productItems) {
			const woItemObject = {
				work_order_id: workOrder.id,
				product_id: item.product_id,
				budget_id: item.budget_id,
				productSnapshot: item.productSnapshot,
				uomSnapshot: item.uomSnapshot || null,
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
				await IndentItemRepository.increment(
					{ qty_for_purchase_order: -parseFloat(item.qty) },
					{
						where: { indent_id, product_id: item.product_id },
						transaction,
					},
				);
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
				await IndentItemRepository.increment(
					{ qty_for_purchase_order: parseFloat(existingItem.qty) },
					{
						where: { indent_id, product_id: item.product_id },
						transaction,
					},
				);
			}

			await workOrderItemsRepository.update(existingItem, woItemObject, {
				transaction,
			});

			if (!isServiceItem(item)) {
				await IndentItemRepository.increment(
					{ qty_for_purchase_order: -parseFloat(item.qty) },
					{
						where: { indent_id, product_id: item.product_id },
						transaction,
					},
				);
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

exports.getAllWorkOrders = async (req) => {
	const { org_id, role } = req.user;
	const { from_date, to_date } = req.query;
	const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
	const offset = req.query.offset ? parseInt(req.query.offset) : undefined;

	if (!org_id && role !== 'Admin') {
		throw new AppError(`You don't authorize to access this api.`);
	}

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

	const findOptions = {
		where: whereClause,
		attributes: [
			'id',
			'woPrefix',
			'woNo',
			'woPostfix',
			'dueDate',
			'grandTotal',
			'totalPaid',
			'remainingAmount',
			'woDetail',
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
				attributes: ['id', 'department_id', 'period_id'],
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
			await IndentItemRepository.increment(
				{ qty_for_purchase_order: parseFloat(item.qty) },
				{
					where: {
						indent_id: workOrder.indent_id,
						product_id: item.product_id,
					},
					transaction,
				},
			);
		}

		await PaymentRequisition.destroy({ where: { wo_id: id }, transaction });

		await workOrderRepository.delete(workOrder);

		await transaction.commit();
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
		include: [{ model: WorkOrderItem, as: 'items' }],
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

	let combinedHtml = '';
	for (const copy of copies) {
		const title = copyTitles[copy] || 'INVOICE COPY';
		const html = await generateInvoiceHTML(
			{ ...response, copyTitle: title },
			'workOrderTemplate',
		);
		combinedHtml += `
  <div class="preview-page">
	${html}
  </div>
`;
	}

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

	const state = await getState(invoiceData.vendorInfo?.state_id);

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

	let businessLogo = null;
	let business = null;
	if (userData) {
		business = userData.organization;
		business.address = `${business.org_address || ''},<br>
			${business.city || ''} - ${business.pincode || ''}, ${
				business?._state?.state_name || ''
			}<br>`;
		if (userData.logo) {
			businessLogo = await generateSignedUrl(userData.logo);
		}
	}

	return {
		...invoiceData,
		businessLogo,
		business,
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
				batches: [],
				serials: [],
				taxRate: invoiceData.same_state
					? item.tax ? item.tax.rate / 2 : '0'
					: item.tax ? item.tax.rate : '0',
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
		combineInvoiceNumber: `${invoiceData.woPrefix || ''}${invoiceData.woNo || ''}${invoiceData.woPostfix || ''}`,
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
	};
}

async function getState(id) {
	if (!id) return null;
	const url = `${VCP_SERVICE_API_BASE_URL}states/${id}`;
	const response = await fetch(url, { method: 'GET' });
	const data = await response.json();
	return data || null;
}

exports.getWorkOrderNo = async (req) => {
	const user = req.user;
	logger.info('getWorkOrderNo: ', { user });

	if (
		!user ||
		!user.org_id ||
		(!user.roles.includes('org_admin') && !user.roles.includes('app_admin'))
	) {
		const errorMsg =
			user?.role === 'Super Admin'
				? "As a super admin user you can't create a work order."
				: 'Invalid user or organization ID';
		throw new AppError(errorMsg, 403);
	}

	const latestWorkOrder = await workOrderRepository.findOne({
		where: { org_id: user.org_id },
		order: [['createdAt', 'DESC']],
	});

	let newWorkOrderNumber = 1;
	if (latestWorkOrder) {
		const latestNumber = parseInt(latestWorkOrder.woNo, 10);
		if (!isNaN(latestNumber)) {
			newWorkOrderNumber = latestNumber + 1;
		}
	}

	return newWorkOrderNumber.toString().padStart(4, '0');
};

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
	const fileName = `work_order_report_${ts}.xlsx`;
	const filePath = path.join(__dirname, `../../storage/work-orders/${fileName}`);

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
				'id', 'woPrefix', 'woNo', 'woPostfix', 'woDetail', 'vendorInfo',
				'dueDate', 'grandTotal', 'total_taxable', 'total_tax',
				'totalPaid', 'remainingAmount', 'paymentStatus', 'status',
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
			],
			order: [['createdAt', 'DESC']],
			limit: EXPORT_BATCH_SIZE,
			offset,
		});

		if (!batch || batch.length === 0) break;

		for (const woInstance of batch) {
			const wo = woInstance.get({ plain: true });

			const woNumber = `${safeStr(wo.woPrefix)}${safeStr(wo.woNo)}${safeStr(wo.woPostfix)}`;
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
				const uomCode = safeStr(uomSnap.code ?? uomSnap.name ?? uomSnap.short_name ?? '');

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

	await workbook.xlsx.writeFile(filePath);

	const baseUrl = BASE_URL || 'http://localhost:4300';
	return {
		fileName,
		path: `${baseUrl}/storage/work-orders/${fileName}`,
	};
};
