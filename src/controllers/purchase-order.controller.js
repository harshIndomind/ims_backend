const {
	Product,
	ProductBatch,
	ProductSerial,
	Invoice,
	InvoiceItem,
	InvoiceItemSerial,
	BusinessPartner,
	sequelize,
	Tax,
	OrganizationBankDetails,
	GstStateCode,
	Payment,
	PaymentInvoice,
	Sequelize,
	ProductUOM,
	Unit,
	User,
	organization,
	CreditNoteInvoiceItemSerial,
	CreditNoteInvoiceItem,
	CreditNoteInvoice,
} = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { generateInvoicePDF } = require('../pdf/pdfGenerator');
const {
	generateInvoiceHTMLPDF,
	generateInvoiceHTML,
} = require('../pdf/htmlPdfGenerator');
const path = require('path');
const ExcelJS = require('exceljs');
const { BASE_URL } = require('../config/serverConfig');
const { format } = require('date-fns');
const moment = require('moment');
const { print } = require('../utils/common');
const { generateSignedUrl } = require('../utils/s3Bucket');
const logger = require('../utils/logger');
const purchaseOrderService = require('../services/purchase-order.service');
const ApiResponse = require('../utils/ApiResponse');

exports.createPurchaseOrder = catchAsync(async (req, res) => {
	console.log('CREATE PURCHASE ORDER BODY', req.body);
	// return
	const purchaseOrder = await purchaseOrderService.createPurchaseOrder(req);

	ApiResponse.send(
		res,
		201,
		'Purchase Order created successfully',
		purchaseOrder,
	);
});

exports.getAllPurchaseOrders = catchAsync(async (req, res) => {
	const purchaseOrder = await purchaseOrderService.getAllPurchaseOrders(req);
	ApiResponse.send(
		res,
		200,
		'Purchase Orders fetched successfully',
		purchaseOrder,
	);
});

exports.exportPurchaseOrders = catchAsync(async (req, res) => {
	const result = await purchaseOrderService.exportPurchaseOrders(req);
	res.status(200).json({
		message: 'Purchase orders exported successfully',
		path: result.path,
	});
});

exports.getPurchaseOrderById = catchAsync(async (req, res) => {
	const purchaseOrder = await purchaseOrderService.getPurchaseOrderById(req);
	ApiResponse.send(
		res,
		200,
		'A Purchase Order fetched successfully',
		purchaseOrder,
	);
});

exports.updatePurchaseOrder = catchAsync(async (req, res) => {
	console.log('UPDATE PURCHASE ORDER BODY', req.body);
	// return
	const updatedPurchaseOrder =
		await purchaseOrderService.updatePurchaseOrder(req);

	ApiResponse.send(
		res,
		201,
		'Purchase Order updated successfully',
		updatedPurchaseOrder,
	);
});

exports.deletePurchaseOrder = catchAsync(async (req, res) => {
	const deletePurchaseOrder =
		await purchaseOrderService.deletePurchaseOrder(req);
	res.status(200).json({
		message: 'Purchase order deleted successfully',
		data: deletePurchaseOrder,
	});
});

exports.generatePoNumber = catchAsync(async (req, res) => {
	const purchaseOrderNumber =
		await purchaseOrderService.getPurchaseOrderNo(req);
	res.status(200).json({
		message: 'Generated purchase order number successfully',
		data: purchaseOrderNumber,
	});
});

exports.generateInvoiceHtml = catchAsync(async (req, res) => {
	const combinedHtml = await purchaseOrderService.generateInvoiceHtml(req);
	res.json({ html: combinedHtml });
});

exports.downloadInvoicePdf = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;
		const { copies = [], html = '' } = req.body;

		const pdfPath = await generateInvoiceHTMLPDF(html, 'defaultTemplate', {
			multi: true,
		});

		res.json({ pdfUrl: pdfPath });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: err.message || 'Failed to generate HTML' });
	}
});

async function calculateSaleInvoice(invoice) {
	const serialsData = await ProductSerial.findAll();
	const batchData = await ProductBatch.findAll();
	const invoiceData = invoice.get({ plain: true });
	console.log('invoiceData ', invoiceData);

	const totalTaxableAmount = invoiceData.productItems.reduce((sum, item) => {
		const priceAfterDiscount =
			item.discount_price_type === 'percentage'
				? item.price - (item.price * item.discount) / 100
				: item.price - item.discount;
		return sum + priceAfterDiscount * parseFloat(item.qty);
	}, 0);

	const totalCgst = invoiceData.same_state
		? invoiceData.productItems.reduce(
				(sum, item) => sum + parseFloat(item.cgst || 0),
				0,
			)
		: 0;
	const totalSgst = invoiceData.same_state
		? invoiceData.productItems.reduce(
				(sum, item) => sum + parseFloat(item.sgst || 0),
				0,
			)
		: 0;
	const totalIgst = !invoiceData.same_state
		? invoiceData.productItems.reduce(
				(sum, item) => sum + parseFloat(item.igst || 0),
				0,
			)
		: 0;

	const state = await GstStateCode.findByPk(invoiceData.customerInfo.state_id);
	const userData = await User.findOne({
		where: { org_id: invoiceData.orgId, roleId: 2 },
		include: {
			model: organization,
			as: 'organization',
			include: {
				model: GstStateCode,
				as: '_state',
			},
		},
	});
	let businessLogo = null;
	let business = null;
	if (userData) {
		business = userData.organization;
		business.address = `${business.org_address || ''},<br>
${business.city || ''} - ${business.pincode || ''}, ${
			business._state.state_name || ''
		}<br>`;
		if (userData.logo) {
			businessLogo = await generateSignedUrl(userData.logo);
		}
	}

	const response = {
		...invoiceData,
		businessLogo,
		business,
		customerInfo: {
			...invoiceData.customerInfo,
			state_name: `${state?.state_name} (${state?.gst_code})` || 'N/A',
		},
		productItems: invoiceData.productItems.map((item) => ({
			...item,
			item_type: item.product.item_type,
			product_name: item.product.name,
			batches: item.product.stock_type === 'batch' ? batchData : [],
			serials: serialsData.map((s) => ({
				...s,
				label: s.serial_no,
				value: s.id.toString(),
				key: s.id.toString(),
			})),
			selectedSerials: item.serials?.map((serial) => serial.serial_no) || [],
			stockQty: (() => {
				if (item.stock_type === 'normal') {
					return item.product.available_qty || 1;
				} else if (item.stock_type === 'batch') {
					return batchData ? batchData.length : 0;
				} else if (item.stock_type === 'serial') {
					// const totalSerials = serialsData.filter(
					// 	(s) => s.product_id === item.product_id && s.is_sell === 0
					// ).length;
					return serialsData ? serialsData.length : 0;
				}
				return 0;
			})(),
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
		})),
		additionalRemarks: invoiceData.remarks,
		combineInvoiceNumber: `${invoiceData.invoicePrefix || ''}${
			invoiceData.invoiceNo || ''
		}${invoiceData.invoicePostfix || ''}`,
		totalCgst,
		totalSgst,
		totalIgst,
		totalDiscountAmount: invoiceData.productItems.reduce((sum, item) => {
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
		totalQuantity: invoiceData.productItems.reduce(
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

exports.getInvoicesByCustomerId = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;
		const { org_id } = req.user;

		const invoices = await Invoice.findAll({
			where: { orgId: org_id, customerId: id },
			include: [
				{
					model: BusinessPartner,
					as: 'partner',
				},
			],
		});

		res.status(200).json({
			message: 'Customer invocies fetched successfully.',
			data: invoices,
		});
	} catch (error) {
		res.status(500).json({
			message: error.message || `Error while fetching customer invoices`,
		});
	}
});

exports.generatePaymentRecieptNumber = catchAsync(async (req, res) => {
	const user = req.user;

	if (!user || !user.org_id || user.role !== 'Admin') {
		return res.status(400).json({ message: 'Invalid user or organization ID' });
	}

	// Find the latest invoice with the given prefix and postfix
	const latestReceipt = await Payment.findOne({
		where: {
			orgId: user.org_id,
			type: 'INWARD',
		},
		order: [['createdAt', 'DESC']],
	});

	let newReceiptNumber = 1;
	if (latestReceipt) {
		const latestNumber = parseInt(latestReceipt.receiptNumber, 10);
		if (!isNaN(latestNumber)) {
			newReceiptNumber = latestNumber + 1;
		}
	}

	res.status(200).json({
		message: 'Generated receipt number successfully',
		receiptNumber: newReceiptNumber.toString().padStart(4, '0'),
	});
});

exports.createPaymentReceipt = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const { org_id } = req.user;

		const data = req.body;

		if (typeof data.customerInfo == 'string') {
			try {
				data.customerInfo = JSON.parse(data.customerInfo);
			} catch (e) {
				return res.status(400).json({ message: 'Invalid customerInfo JSON' });
			}
		}

		if (typeof data.invoices == 'string') {
			try {
				data.invoices = JSON.parse(data.invoices);
			} catch (e) {
				return res.status(400).json({ message: 'Invalid invoices JSON' });
			}
		}

		const {
			type,
			receiptPrefix,
			receiptNumber,
			receiptPostfix,
			customerInfo,
			paymentDate,
			amount,
			isPaymentAdv,
			advAmount,
			paymentType,
			remarks,
			invoices,
			transaction_id,
		} = data;

		// 1️⃣ Create main payment
		const payment = await Payment.create(
			{
				orgId: org_id,
				type,
				receiptPrefix,
				receiptNumber,
				receiptPostfix,
				customer_id: customerInfo.customer_id,
				paymentDate,
				amount,
				is_payment_adv: isPaymentAdv,
				advAmount: advAmount || 0,
				paymentType,
				remarks,
				transaction_id: transaction_id ?? null,
			},
			{ transaction: t },
		);

		// 2️⃣ Create invoice links
		if (Array.isArray(invoices) && invoices.length > 0) {
			console.log('invoices ', invoices);

			for (const inv of invoices) {
				if (!inv.selected) continue;
				console.log('inv.selected ', inv.selected);

				const total = parseFloat(inv.total) || 0;
				const adjusted = parseFloat(inv.amountAdjusted) || 0;
				const remaining = parseFloat(inv.remainingAmount) || 0;

				// 1️⃣ Create the PaymentInvoice record
				await PaymentInvoice.create(
					{
						payment_id: payment.id,
						invoice_id: inv.id,
						amount_adjusted: adjusted,
						remaining_amount: remaining,
						selected: !!inv.selected,
					},
					{ transaction: t },
				);

				await Invoice.increment(
					{ totalPaid: adjusted },
					{ where: { id: inv.id }, transaction: t },
				);

				// 2️⃣ Update the invoice totals
				const updated = await Invoice.update(
					{
						remainingAmount: remaining,
						status: remaining === 0 ? 'completed' : 'pending',
						paymentStatus: remaining === 0 ? paymentType : 'PARTIAL',
					},
					{ where: { id: inv.id }, transaction: t },
				);

				console.log('updated ', updated);
			}
		}

		await t.commit();
		res.status(201).json({ message: 'Payment saved successfully', payment });
	} catch (err) {
		await t.rollback();
		console.error(err);
		res
			.status(500)
			.json({ message: 'Failed to save payment', error: err.message });
	}
});

exports.getPayments = catchAsync(async (req, res) => {
	try {
		const { org_id } = req.user;

		// You can also add pagination or filters later if needed
		const payments = await Payment.findAll({
			where: { orgId: org_id },
			include: [
				{
					model: PaymentInvoice,
					as: 'invoices',
					include: [
						{
							model: Invoice,
							as: 'invoice',
							// attributes: ['id', 'invoiceNo', 'grandTotal', 'dueDate'],
						},
					],
				},
				{
					model: BusinessPartner,
					as: 'customer',
				},
			],
			order: [['paymentDate', 'DESC']],
		});

		res.status(200).json({
			message: 'Payments fetched successfully',
			data: payments,
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({
			message: 'Failed to fetch payments',
			error: err.message,
		});
	}
});

exports.getPaymentReceipt = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { org_id } = req.user;

	const payment = await Payment.findOne({
		where: { id, orgId: org_id },
		include: [
			{
				model: BusinessPartner,
				as: 'customer',
			},
			{
				model: PaymentInvoice,
				as: 'invoices',
				include: [{ model: Invoice, as: 'invoice' }],
			},
		],
	});

	if (!payment) {
		return res.status(404).json({ message: 'Payment not found' });
	}

	res.json({ data: payment });
});

exports.updatePaymentReceipt = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const { id } = req.params;
		const { org_id } = req.user;

		const data = req.body;

		const { paymentDate, paymentType, remarks, invoices, transaction_id } =
			data;

		const payment = await Payment.update(
			{
				paymentDate,
				paymentType,
				remarks,
				transaction_id: transaction_id ?? null,
			},
			{ where: { id }, transaction: t },
		);

		await t.commit();
		res.status(201).json({ message: 'Receipt update successfully' });
	} catch (err) {
		await t.rollback();
		console.error(err);
		res
			.status(500)
			.json({ message: 'Failed to save receipt', error: err.message });
	}
});

exports.deletePaymentReceipt = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const { id } = req.params; // Payment ID
		const { org_id } = req.user;

		// 1️⃣ Find payment
		const payment = await Payment.findOne({
			where: { id, orgId: org_id },
			transaction: t,
		});

		if (!payment) {
			await t.rollback();
			return res.status(404).json({ message: 'Payment not found' });
		}

		// 2️⃣ Find all related PaymentInvoice records
		const paymentInvoices = await PaymentInvoice.findAll({
			where: { payment_id: id },
			transaction: t,
		});

		// 3️⃣ Revert invoice amounts
		for (const pi of paymentInvoices) {
			const invoice = await Invoice.findByPk(pi.invoice_id, { transaction: t });
			if (!invoice) continue;

			const newTotalPaid =
				(parseFloat(invoice.totalPaid) || 0) -
				(parseFloat(pi.amount_adjusted) || 0);

			const newRemaining =
				(parseFloat(invoice.remainingAmount) || 0) +
				(parseFloat(pi.amount_adjusted) || 0);

			await Invoice.update(
				{
					totalPaid: Math.max(newTotalPaid, 0),
					remainingAmount: Math.max(newRemaining, 0),
					status: newRemaining === 0 ? 'completed' : 'pending',
					paymentType: 'CREDIT',
				},
				{ where: { id: pi.invoice_id }, transaction: t },
			);
		}

		// 4️⃣ Delete related PaymentInvoice records
		await PaymentInvoice.destroy({
			where: { payment_id: id },
			transaction: t,
		});

		// 5️⃣ Delete main Payment record
		await Payment.destroy({
			where: { id },
			transaction: t,
		});

		await t.commit();
		res.status(200).json({ message: 'Payment receipt deleted successfully' });
	} catch (err) {
		await t.rollback();
		console.error(err);
		res.status(500).json({
			message: 'Failed to delete payment receipt',
			error: err.message,
		});
	}
});

exports.exportSaleInvoices = catchAsync(async (req, res) => {
	const { org_id, role } = req.user;
	const { from_date, to_date } = req.query;
	const fromDate = new Date(from_date);
	const toDate = new Date(to_date);

	// Validate that both dates are valid
	if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
		throw new Error('Invalid date range');
	}

	// Adjust the end date to include the full day (23:59:59)
	toDate.setHours(23, 59, 59, 999);
	if (!org_id && role !== 'Admin') {
		throw AppError(`You don't authorize to access this api.`);
	}

	const invoices = await Invoice.findAll({
		where: {
			orgId: org_id,
			createdAt: {
				[Op.between]: [fromDate, toDate],
			},
		},
		include: [
			{
				model: BusinessPartner,
				as: 'partner',
				attributes: ['name'],
			},
			{
				model: PaymentInvoice,
				as: 'payments',
				include: {
					model: Payment,
					as: 'receipt',
				},
				separate: true,
				order: [['createdAt', 'ASC']],
			},
		],
		attributes: [
			'id',
			'invoicePrefix',
			'invoiceNo',
			'invoicePostfix',
			'dueDate',
			'grandTotal',
			'totalPaid',
			'remainingAmount',
			'paymentType',
			'invoiceDetail',
			'status',
			'createdAt',
			'paymentStatus',
		],
		order: [['createdAt', 'DESC']],
	});

	let response = invoices.map((inv) => inv.get({ plain: true }));
	console.log('response ', response);

	if (invoices) {
		response = response.map((invoice) => {
			return {
				...invoice,
				paymentMsg: (() => {
					let message = null;
					const ref = [];
					if (invoice.payments.length > 0) {
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
				invoiceDetail: {
					...invoice.invoiceDetail,
					date: new Date(invoice.invoiceDetail.date).toLocaleDateString(
						'en-IN',
						{
							year: 'numeric',
							month: '2-digit',
							day: '2-digit',
						},
					),
				},
			};
		});
	}

	const workbook = new ExcelJS.Workbook();
	const templatePath = path.join(
		__dirname,
		'../templates/sale-invoice-template.xlsx',
	);
	const options = {
		dateFormats: ['DD/MM/YYYY'],
	};
	await workbook.xlsx.readFile(templatePath, options);

	const sheet = workbook.getWorksheet('Sheet1');
	let rowStart = 2;

	if (response) {
		response.forEach((inv, index) => {
			const row = sheet.getRow(rowStart++);
			row.getCell(1).value = index + 1; // Sr. No.
			row.getCell(2).value = `${inv.invoicePrefix || ''}${inv.invoiceNo}${
				inv.invoicePostfix || ''
			}`; // Invoice No.
			row.getCell(3).value = inv.partner.name; // Company Name
			const inputDate = inv.invoiceDetail.date; // e.g., "13/11/2025"
			console.log('inv.invoiceDetail.date ', inputDate);

			const momentDate = moment(inputDate, 'DD/MM/YYYY', true);

			if (!momentDate.isValid()) {
				console.error('Invalid date format:', inputDate);
				return; // or handle accordingly
			}

			const isoDate = momentDate.toDate();
			console.log('isoDate ', isoDate);

			row.getCell(4).value = format(isoDate, 'dd-MM-yyyy');
			row.getCell(5).value = inv.grandTotal; // Total
			row.getCell(6).value = inv.paymentStatus.toUpperCase(); // Payment Status
			row.getCell(7).value = inv.status.toUpperCase(); // Final Status
			row.getCell(8).value = inv.totalPaid; // Total Paid
			row.getCell(9).value = inv.remainingAmount; // Outstanding
			row.commit();
		});

		sheet.columns.forEach((column) => {
			let maxLength = 0;

			column.eachCell({ includeEmpty: true }, (cell) => {
				cell.alignment = { vertical: 'middle', horizontal: 'left' };
				let columnLength = 10; // minimum width
				if (cell.value) {
					if (cell.type === ExcelJS.ValueType.Date) {
						// Show how Excel will display it
						columnLength = 19; // "dd/mm/yyyy hh:mm:ss" is 19 chars
					} else {
						columnLength = cell.value.toString().length;
					}
				}
				if (columnLength > maxLength) {
					maxLength = columnLength;
				}
			});
			column.width = Math.min(maxLength + 2, 25);
		});
	}

	const now = new Date();
	const formatted = `${now.getFullYear()}-${(now.getMonth() + 1)
		.toString()
		.padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now
		.getHours()
		.toString()
		.padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now
		.getSeconds()
		.toString()
		.padStart(2, '0')}`;

	const fileName = formatted + '_sale-invoices.xlsx';
	const tmpPath = path.join(__dirname, `../../storage/invoices/${fileName}`);
	await workbook.xlsx.writeFile(tmpPath, options);

	const baseUrl = BASE_URL || 'http://localhost:5000';

	const fileDownloadPath = `${baseUrl}/storage/invoices/${fileName}`;

	res.status(200).json({
		message: 'Sale invoices exported successfully',
		path: fileDownloadPath,
	});
});

async function uomConversion(qty, product_id, selected_unit_id) {
	// 1️⃣ Get product with its base unit and UOM conversions
	const product = await Product.findOne({
		where: { id: product_id },
		include: [
			{ model: ProductUOM, as: 'uoms', include: [{ model: Unit, as: 'unit' }] },
		],
	});

	// 2️⃣ Find conversion ratio
	let conversionRatio = 1; // default for base unit

	const selectUnit = await ProductUOM.findOne({
		where: { id: selected_unit_id },
	});

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

exports.cancelInvoice = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { org_id, role } = req.user;

	if (role !== 'Admin' && !org_id) {
		throw new AppError(`You are not authorized to access this API.`, 403);
	}

	const t = await sequelize.transaction();

	try {
		const invoice = await Invoice.findOne({
			where: { id, orgId: org_id },
			include: [
				{
					model: InvoiceItem,
					as: 'productItems',
					include: [
						{ model: InvoiceItemSerial, as: 'serials' },
						{ model: Product, as: 'product' },
					],
				},
			],
			transaction: t,
			lock: t.LOCK.UPDATE,
		});

		if (!invoice) {
			await t.rollback();
			return res.status(404).json({ message: 'Invoice not found' });
		}

		if (invoice.paymentStatus === 'CANCELLED') {
			await t.rollback();
			return res.status(400).json({ message: 'Invoice is already cancelled' });
		}

		// Load all credit notes once (avoid N+1)
		const allCreditNotes = await CreditNoteInvoice.findAll({
			where: { invoice_id: invoice.id },
			include: [
				{
					model: CreditNoteInvoiceItem,
					as: 'productItems',
				},
			],
			transaction: t,
		});

		// Map credit notes by product
		const creditNoteMap = {};
		for (const cn of allCreditNotes) {
			for (const item of cn.productItems) {
				creditNoteMap[item.product_id] =
					(creditNoteMap[item.product_id] || 0) + Number(item.qty || 0);
			}
		}

		// Revert stock
		for (const item of invoice.productItems) {
			let uomQty = Number(item.qty) || 0;

			if (item.selected_uom_id > 0) {
				uomQty = await uomConversion(
					parseInt(item.qty),
					parseInt(item.product_id),
					parseInt(item.selected_uom_id),
				);
			}

			const cnQty = creditNoteMap[item.product_id] || 0;
			itemQuantity = Math.max(0, uomQty - cnQty);
			print(
				{
					product_name: item.product.name,
					itemQuantity,
					serials: item.serials.map((s) => s.serial_no),
					stockType: item.product.stock_type,
					itemType: item.product.item_type,
				},
				'Cancelling invoice reverting Stock itemQuantity => ',
			);

			logger.info({
				message: 'Cancelling invoice reverting Stock itemQuantity =>',
				product_name: item.product.name,
				itemQuantity,
				serials: item.serials.map((s) => s.serial_no),
				stockType: item.product.stock_type,
				itemType: item.product.item_type,
			});

			if (item.product.stock_type === 'batch') {
				await ProductBatch.increment(
					{ qty: itemQuantity },
					{ where: { id: item.batch_id }, transaction: t },
				);
			} else if (
				item.product.stock_type === 'normal' &&
				item.product.item_type === 'product'
			) {
				await Product.increment(
					{ available_qty: itemQuantity },
					{ where: { id: item.product_id }, transaction: t },
				);
			} else if (item.product.stock_type === 'serial') {
				await ProductSerial.update(
					{ is_sell: 0 },
					{
						where: {
							serial_no: { [Op.in]: item.serials.map((s) => s.serial_no) },
						},
						transaction: t,
					},
				);
			}
		}
		// return;
		// Cancel all credit notes
		await CreditNoteInvoice.update(
			{ paymentStatus: 'CANCELLED' },
			{
				where: { invoice_id: invoice.id },
				transaction: t,
			},
		);

		// Cancel invoice
		await invoice.update({ paymentStatus: 'CANCELLED' }, { transaction: t });

		await t.commit();

		return res.status(200).json({ message: 'Invoice cancelled successfully' });
	} catch (err) {
		if (!t.finished) await t.rollback();
		console.error(err);
		return res.status(500).json({ message: 'Internal server error' });
	}
});

exports.restoreInvoice = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { org_id, role } = req.user;

	if (role !== 'Admin' && !org_id) {
		throw new AppError(`You are not authorized to access this API.`, 403);
	}

	const t = await sequelize.transaction();

	try {
		const invoice = await Invoice.findOne({
			where: { id, orgId: org_id },
			include: [
				{
					model: InvoiceItem,
					as: 'productItems',
					include: [
						{ model: InvoiceItemSerial, as: 'serials' },
						{ model: Product, as: 'product' },
					],
				},
			],
			transaction: t,
			lock: t.LOCK.UPDATE,
		});

		if (!invoice) {
			await t.rollback();
			return res.status(404).json({ message: 'Invoice not found' });
		}

		if (invoice.paymentStatus !== 'CANCELLED') {
			await t.rollback();
			return res
				.status(400)
				.json({ message: "You can't restore a not cancelled invoice." });
		}

		// Load all credit notes once (avoid N+1)
		const allCreditNotes = await CreditNoteInvoice.findAll({
			where: { invoice_id: invoice.id },
			include: [
				{
					model: CreditNoteInvoiceItem,
					as: 'productItems',
				},
			],
			transaction: t,
		});

		// Map credit notes by product
		const creditNoteMap = {};
		for (const cn of allCreditNotes) {
			for (const item of cn.productItems) {
				creditNoteMap[item.product_id] =
					(creditNoteMap[item.product_id] || 0) + Number(item.qty || 0);
			}
		}

		// Revert stock
		for (const item of invoice.productItems) {
			let uomQty = Number(item.qty) || 0;

			if (item.selected_uom_id > 0) {
				uomQty = await uomConversion(
					parseInt(item.qty),
					parseInt(item.product_id),
					parseInt(item.selected_uom_id),
				);
			}

			const cnQty = creditNoteMap[item.product_id] || 0;
			itemQuantity = Math.max(0, uomQty - cnQty);

			print(
				{
					product_name: item.product.name,
					itemQuantity,
					serials: item.serials.map((s) => s.serial_no),
					stockType: item.product.stock_type,
					itemType: item.product.item_type,
				},
				'Restoring invoice reverting Stock itemQuantity => ',
			);

			logger.info({
				message: 'Restoring invoice reverting Stock itemQuantity =>',
				product_name: item.product.name,
				itemQuantity,
				serials: item.serials.map((s) => s.serial_no),
				stockType: item.product.stock_type,
				itemType: item.product.item_type,
			});

			if (item.product.stock_type === 'batch') {
				await ProductBatch.increment(
					{ qty: -itemQuantity },
					{ where: { id: item.batch_id }, transaction: t },
				);
			} else if (
				item.product.stock_type === 'normal' &&
				item.product.item_type === 'product'
			) {
				await Product.increment(
					{ available_qty: -itemQuantity },
					{ where: { id: item.product_id }, transaction: t },
				);
			} else if (item.product.stock_type === 'serial') {
				await ProductSerial.update(
					{ is_sell: 1 },
					{
						where: {
							serial_no: { [Op.in]: item.serials.map((s) => s.serial_no) },
						},
						transaction: t,
					},
				);
			}
		}

		const PAYMENT_STATUS =
			allCreditNotes.length > 0 ? 'CREDIT_NOTE' : 'PENDING';
		if (allCreditNotes.length > 0) {
			await CreditNoteInvoice.update(
				{ paymentStatus: 'PENDING' },
				{
					where: { invoice_id: invoice.id },
					transaction: t,
				},
			);
		}

		await invoice.update({ paymentStatus: PAYMENT_STATUS }, { transaction: t });

		await t.commit();

		return res.status(200).json({ message: 'Invoice restored successfully' });
	} catch (err) {
		if (!t.finished) await t.rollback();
		console.error(err);
		return res.status(500).json({ message: 'Internal server error' });
	}
});
