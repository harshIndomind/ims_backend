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
const { WorkOrderItem, Indent, User, organization, Role, PaymentRequisition } = require('../models/index');
const {
	generateInvoiceHTMLPDF,
	generateInvoiceHTML,
} = require('../pdf/htmlPdfGenerator');
const { fetch } = require('undici');
const { VCP_SERVICE_API_BASE_URL } = require('../config/serverConfig');
const { generateSignedUrl } = require('../utils/s3Bucket');

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

			await IndentItemRepository.increment(
				{ qty_for_purchase_order: -parseFloat(item.qty) },
				{
					where: { indent_id, product_id: item.product_id },
					transaction,
				},
			);
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

			await IndentItemRepository.increment(
				{ qty_for_purchase_order: parseFloat(existingItem.qty) },
				{
					where: { indent_id, product_id: item.product_id },
					transaction,
				},
			);

			await workOrderItemsRepository.update(existingItem, woItemObject, {
				transaction,
			});

			await IndentItemRepository.increment(
				{ qty_for_purchase_order: -parseFloat(item.qty) },
				{
					where: { indent_id, product_id: item.product_id },
					transaction,
				},
			);
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
