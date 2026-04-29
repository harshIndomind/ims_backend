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
const productClient = require('../grpc/clients/product.client');
const productUomClient = require('../grpc/clients/productUom.client');
const promisifyGrpc = require('../utils/promisifyGrpc');

const getProductById = promisifyGrpc(productClient, 'GetProductById');
const getProductUomById = promisifyGrpc(productUomClient, 'GetProductUomById');
const { Op, where } = require('sequelize');
const {
	User,
	organization,
	PurchaseOrderItem,
	Indent,
	Role
} = require('../models/index');
const {
	generateInvoiceHTMLPDF,
	generateInvoiceHTML,
} = require('../pdf/htmlPdfGenerator');
const { fetch } = require('undici');
const { VCP_SERVICE_API_BASE_URL } = require('../config/serverConfig');
const { generateSignedUrl } = require('../utils/s3Bucket');

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
		} = req.body;

		for (const item of productItems) {
			if (Number(item.qty) > Number(item.qty_for_purchase_order)) {
				throw new AppError(
					`${item.productSnapshot.name} qty ${item.qty} should not be greater than P.O Order qty ${item.qty_for_purchase_order}`,
				);
			}
		}

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
			status: 'pending',
			remainingAmount: grandTotal,
			po_qc_check,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
		};

		const purchaseOrder = await purchaseOrderRepository.create(poObject, {
			transaction,
		});

		for (const item of productItems) {
			const poItemsObject = {
				purchase_order_id: purchaseOrder.id,
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
					Number(item.selected_uom_id) > 0
						? Number(item.selected_uom_id)
						: null,
				specification: item.specification,
			};
			const purchaseOrderItems = await purchaseOrderItemsRepository.create(
				poItemsObject,
				{ transaction },
			);

			await IndentItemRepository.increment(
				{ qty_for_purchase_order: -parseFloat(item.qty) },
				{
					where: { indent_id: indent_id, product_id: item.product_id },
					transaction,
				},
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
		} = req.body;

		for (const item of productItems) {
			if (Number(item.qty) > Number(item.qty_for_purchase_order)) {
				throw new AppError(
					`${item.productSnapshot.name} qty ${item.qty} should not be greater than P.O Order qty ${item.qty_for_purchase_order}`,
				);
			}
		}

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
			status: 'pending',
			remainingAmount: grandTotal,
			po_qc_check,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
		};

		const purchaseOrder = await purchaseOrderRepository.findById(id, {
			transaction,
		});

		if (!purchaseOrder) {
			throw new AppError('Pruchase order not found.');
		}

		await purchaseOrderRepository.update(purchaseOrder, poObject, {
			transaction,
		});

		for (const item of productItems) {
			const poItemsObject = {
				purchase_order_id: purchaseOrder.id,
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
					Number(item.selected_uom_id) > 0
						? Number(item.selected_uom_id)
						: null,
				specification: item.specification,
			};

			const purchaseOrderItem = await purchaseOrderItemsRepository.findOne({
				where: {
					purchase_order_id: purchaseOrder.id,
					product_id: item.product_id,
				},
				transaction,
			});

			if (!purchaseOrderItem) {
				throw new AppError('Purchase order item not found.');
			}

			await IndentItemRepository.increment(
				{ qty_for_purchase_order: parseFloat(purchaseOrderItem.qty) },
				{
					where: { indent_id: indent_id, product_id: item.product_id },
					transaction,
				},
			);

			await purchaseOrderItemsRepository.update(
				purchaseOrderItem,
				poItemsObject,
				{ transaction },
			);

			await IndentItemRepository.increment(
				{ qty_for_purchase_order: -parseFloat(item.qty) },
				{
					where: { indent_id: indent_id, product_id: item.product_id },
					transaction,
				},
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

exports.getAllPurchaseOrders = async (req) => {
	const { org_id, role } = req.user;

	const { from_date, to_date } = req.query;
	const fromDate = new Date(from_date);
	const toDate = new Date(to_date);
	const limit = parseInt(req.query.limit) || 10;
	const offset = parseInt(req.query.offset) || 0;
	// Validate that both dates are valid
	if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
		throw new AppError('Invalid date range');
	}

	// Adjust the end date to include the full day (23:59:59)
	toDate.setHours(23, 59, 59, 999);
	if (!org_id && role !== 'Admin') {
		throw new AppError(`You don't authorize to access this api.`);
	}

	const purchaseOrders = await purchaseOrderRepository.findAll({
		where: {
			org_id: org_id,
			createdAt: {
				[Op.between]: [fromDate, toDate],
			},
		},
		// include: [
		// 	{
		// 		model: BusinessPartner,
		// 		as: 'partner',
		// 		attributes: ['name'],
		// 	},
		// 	{
		// 		model: PaymentInvoice,
		// 		as: 'payments',
		// 		include: {
		// 			model: Payment,
		// 			as: 'receipt',
		// 		},
		// 		separate: true,
		// 		order: [['createdAt', 'ASC']],
		// 	},
		// ],
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
		offset,
		limit,
		order: [['createdAt', 'DESC']],
	});

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
				attributes: ['id', 'department_id', 'period_id'],
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
		const purchaseOrder = await purchaseOrderRepository.findById(id, {
			include: [{ model: PurchaseOrderItem, as: 'items' }],
			transaction,
		});

		if (!purchaseOrder) {
			await transaction.rollback();
			logger.warn('Purchase Order not found for delete', { id });
			throw new AppError('Purchase Order not found', StatusCodes.NOT_FOUND);
		}

		for (const item of purchaseOrder.items) {
			await IndentItemRepository.increment(
				{ qty_for_purchase_order: parseFloat(item.qty) },
				{
					where: {
						indent_id: purchaseOrder.indent_id,
						product_id: item.product_id,
					},
					transaction,
				},
			);
		}

		await purchaseOrderRepository.delete(purchaseOrder);

		logger.info('Purchase Order deleted', { id });

		await transaction.commit();
		return true;
	} catch (error) {
		if (transaction && !transaction.finished) {
			try {
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

async function uomConversion(qty, product_id, selected_unit_id) {
	const product = await getProductById({ productId: product_id });
	console.log('Product from VCP:', product);
	// 2️⃣ Find conversion ratio
	let conversionRatio = 1; // default for base unit

	const selectUnit = await getProductUomById({ id: selected_unit_id });
	console.log('Product UOM from VCP:', selectUnit);

	if (selectUnit.unit_id !== product.unit_id) {
		const uom = product.uoms.find((u) => u.id === selected_unit_id);
		if (!uom) throw new Error('Invalid UOM selected for this product');

		// uom.qty means "1 base unit = uom.qty of this unit"
		// So 1 GMS = 1 / 1000 KGS
		conversionRatio = 1 / parseFloat(uom.qty);
	}

	print(conversionRatio, 'conversionRatio => ');
	// 3️⃣ Calculate base unit quantity to deduct
	const deductedQtyInBase = parseFloat(qty) * conversionRatio;
	print(deductedQtyInBase, 'deductedQtyInBase => ');

	return deductedQtyInBase;
	// 4️⃣ Update product stock
	// product.available_qty -= deductedQtyInBase;
	// await product.save();
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
			],
		});

		if (!purchaseOrder)
			return res.status(404).json({ message: 'Purchase order not found' });

		const response = await calculateSaleInvoice(purchaseOrder);
		console.log('response ', response);
		// return
		const copyTitles = {
			original: 'ORIGINAL FOR RECIPIENT',
			duplicate: 'DUPLICATE COPY',
			transport: 'DUPLICATE FOR TRANSPORTER',
			office: 'TRIPLICATE FOR SUPPLIER',
		};

		let combinedHtml = '';

		if (copies.length === 0) copies.push('original'); // default

		for (const copy of copies) {
			const title = copyTitles[copy] || 'INVOICE COPY';
			const html = await generateInvoiceHTML(
				{ ...response, copyTitle: title },
				'defaultTemplate',
			);
			combinedHtml += `
  <div class="preview-page">
	${html}
  </div>
`;
		}

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

	const state = await getState(invoiceData.vendorInfo.state_id);

	const orgRole = await Role.findOne({where: {code: 'org_admin'}, attributes: ['id']});
		
	const userData = await User.findOne({
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
				where: orgRole.id,
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
	console.log('invoiceData.items ', invoiceData.items);
	const response = {
		...invoiceData,
		businessLogo,
		business,
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
				batches: snapshot.stock_type === 'batch' ? batchData : [],
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
					if (invoiceData.same_state) {
						return item.tax ? item.tax.rate / 2 : '0';
					} else {
						return item.tax ? item.tax.rate : '0';
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
