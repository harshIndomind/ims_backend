const {
	Product,
	ProductBatch,
	ProductSerial,
	Invoice,
	CreditNoteInvoice,
	CreditNoteInvoiceItem,
	CreditNoteInvoiceItemSerial,
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
	InvoiceItem,
	InvoiceItemSerial,
} = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { Op, where } = require('sequelize');
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
exports.createInvoice = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const {
			invoice_id,
			orgId,
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
			customerInfo,
			invoiceDetail,
			productItems,
			paymentType,
			additionalNotes,
			customField1,
			customField2,
		} = req.body;

		const reverseStock = invoiceDetail.reverseStock;
		print(JSON.stringify(req.body), 'req.body => ', true);
		// return
		const isInvoiceExist = await Invoice.findOne({
			where: {
				id: invoice_id,
				orgId,
			},
			include: [
				{
					model: InvoiceItem,
					as: 'productItems',
					include: [
						{
							model: InvoiceItemSerial,
							as: 'serials',
						},
						{
							model: ProductBatch,
							as: 'batches',
						},
						{
							model: Product,
							as: 'product',
						},
						{
							model: ProductUOM,
							as: 'uoms',
							include: {
								model: Unit,
								as: 'unit',
								attributes: ['code', 'name'],
							},
						},
					],
				},
				{
					model: BusinessPartner,
					as: 'partner',
				},
			],
		});
		if (!isInvoiceExist) {
			return res.status(404).json({ message: 'Invoice not found' });
		}
		// print(req.body, 'req.body => ');
		// return;
		const isSerialDuplicate = checkForDuplicateSerials(productItems);

		if (isSerialDuplicate.status) {
			throw new AppError(
				`Duplicate serial numbers found in the invoice items: ${isSerialDuplicate.duplicateSerials.join(
					', '
				)}`,
				417
			);
		}

		let uomQty = 1;
		for (const item of productItems) {
			if (item.selected_uom_id > 0) {
				uomQty = await uomConversion(
					parseInt(item.qty),
					parseInt(item.product_id),
					parseInt(item.selected_uom_id)
				);
			}

			if (item.stock_type === 'batch') {
				// ✅ Check batch stock
				const batch = await ProductBatch.findByPk(item.batch_id);
				// console.log('isInvoiceExist ', isInvoiceExist.productItems);
				// return;
				if (!batch) {
					throw new AppError(
						`Batch not found for product ID ${item.product_id}`,
						417
					);
				}

				const existingBatch = await InvoiceItem.findOne({
					where: {
						invoice_id,
						batch_id: item.batch_id,
					},
				});
				// console.log('existingBatch ', existingBatch);
				// return;
				if (parseFloat(uomQty) > parseFloat(existingBatch.qty)) {
					// New Way
					// if (parseFloat(item.qty) > parseFloat(batch.qty)) { // Old Way
					throw new AppError(
						`Original batch quantity is ${existingBatch.qty}. But you are trying to create credit note with quantity ${item.qty} for batch ${batch.batch_no}.`,
						417
					);
				}
			} else if (item.stock_type === 'serial') {
				// ✅ Check serials exist and are unsold
				const serials = await ProductSerial.findAll({
					where: {
						serial_no: { [Op.in]: item.selectedSerials },
						is_sell: 1,
					},
				});

				const existingSerials = await InvoiceItemSerial.findAll({
					where: {
						invoice_item_id: invoice_id,
						serial_no: { [Op.in]: item.selectedSerials },
					},
				});
				// print({existingSerialLength: existingSerials.length,existingSerials, selected: item.selectedSerials});return;
				if (serials.length !== item.selectedSerials.length) {
					throw new AppError(
						`Original serial numbers are ${existingSerials
							.map((s) => s.serial_no)
							.join(
								', '
							)}. But you are trying to create credit note with serial numbers ${item.selectedSerials.join(
							', '
						)} for product ${item.product_name}.`,
						// `Some serial numbers are invalid or already sold for product ID ${item.product_name}`,
						417
					);
				}
			} else if (item.stock_type === 'normal' && item.item_type === 'product') {
				// ✅ Check normal stock
				const product = await Product.findByPk(item.product_id);
				if (!product)
					throw new AppError(`Product not found for ID ${item.product_id}`);
				if (parseFloat(uomQty) > parseFloat(product.available_qty)) {
					// New Way
					// if (parseFloat(item.qty) > parseFloat(product.available_qty)) { // Old Way
					throw new AppError(
						`Insufficient stock for product ${product.name}. Available: ${product.available_qty}, Required: ${item.qty}`,
						417
					);
				}
			} else if (item.stock_type === 'normal' && item.item_type === 'service') {
				const isInvoiceItemExits = await InvoiceItem.findOne({
					where: { invoice_id: invoice_id, product_id: item.product_id },
				});

				if (isInvoiceItemExits)
					if (parseFloat(uomQty) > parseFloat(isInvoiceItemExits.qty)) {
						throw new AppError(
							`Original invoice item quantity is ${isInvoiceItemExits.qty}. But you are trying to create credit note with quantity ${item.qty} for service ${item.product_name}.`,
							417
						);
					}
			}
		}
		// return;
		// 1️⃣ Create the Invoice
		const invoice = await CreditNoteInvoice.create(
			{
				invoice_id,
				orgId,
				customerId: customerInfo.customer_id || null,
				bank_id: bank_id || null,
				dueDate,
				invoicePrefix: invoiceDetail.invoicePrefix || null,
				invoiceNo: invoiceDetail.invoiceNumber || null,
				invoicePostfix: invoiceDetail.invoicePostfix || null,
				total_taxable: parseFloat(total_taxable || 0),
				total_tax: parseFloat(total_tax || 0),
				grandTotal: parseFloat(grandTotal || 0),
				isRoundOff,
				paymentType: payment_type,
				customerInfo,
				invoiceDetail,
				additionalNotes,
				customFields: [customField1, customField2],
				remarks: additionalRemarks,
				same_state: state_same,
				status: 'pending',
				remainingAmount: grandTotal,
			},
			{ transaction: t }
		);

		for (const item of productItems) {
			const invoiceItem = await CreditNoteInvoiceItem.create(
				{
					credit_note_invoice_id: invoice.id,
					product_id: item.product_id,
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
						item.selected_uom_id !== undefined &&
						item.selected_uom_id !== null &&
						+item.selected_uom_id !== -1
							? item.selected_uom_id
							: null,
				},
				{ transaction: t }
			);

			// ➤ Create serial mapping
			if (item.stock_type === 'serial' && item.selectedSerials?.length) {
				await Promise.all(
					item.selectedSerials.map((serialNo) =>
						CreditNoteInvoiceItemSerial.create(
							{
								credit_note_invoice_item_id: invoiceItem.id,
								serial_no: serialNo.trim(),
							},
							{ transaction: t }
						)
					)
				);

				if (reverseStock) {
					// ➤ Mark serials as sold
					await ProductSerial.update(
						{ is_sell: 0 },
						{
							where: { serial_no: { [Op.in]: item.selectedSerials } },
							transaction: t,
						}
					);
				}
			}

			if (item.selected_uom_id > 0 && reverseStock) {
				const uomQty = await uomConversion(
					parseInt(item.qty),
					parseInt(item.product_id),
					parseInt(item.selected_uom_id)
				);
				// ➤ Deduct stock
				if (item.stock_type === 'batch') {
					await ProductBatch.increment(
						{ qty: parseFloat(uomQty) },
						{ where: { id: item.batch_id }, transaction: t }
					);
				} else if (
					item.stock_type === 'normal' &&
					item.item_type === 'product'
				) {
					await Product.increment(
						{ available_qty: parseFloat(uomQty) },
						{ where: { id: item.product_id }, transaction: t }
					);
				}
			}
		}

		const latestReceipt = await Payment.findOne({
			where: {
				orgId: orgId,
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

		let creditNoteGrandTotal = parseFloat(grandTotal || 0);
		let isPaymentAdv = 0;
		let remainingAmount = isInvoiceExist.remainingAmount;

		if (creditNoteGrandTotal >= isInvoiceExist.remainingAmount) {
			remainingAmount = creditNoteGrandTotal - remainingAmount;
			isPaymentAdv = creditNoteGrandTotal - isInvoiceExist.remainingAmount;
		} else {
			remainingAmount = isInvoiceExist.remainingAmount - creditNoteGrandTotal;
		}

		await Payment.create(
			{
				orgId: orgId,
				type: 'INWARD',
				receiptNumber: newReceiptNumber.toString().padStart(4, '0'),
				customer_id: customerInfo.customer_id,
				paymentDate: new Date(),
				amount: parseFloat(grandTotal || 0),
				is_payment_adv: isPaymentAdv > 0,
				advAmount: isPaymentAdv,
				paymentType: 'CREDIT_NOTE',
				remarks: 'AUTO GENERATED CREDIT NOTE PAYMENT',
				credit_note_id: invoice.id,
			},
			{ transaction: t }
		);

		await Invoice.increment(
			{ totalPaid: creditNoteGrandTotal },
			{ where: { id: invoice_id }, transaction: t }
		);

		// 2️⃣ Update the invoice totals
		await Invoice.update(
			{
				remainingAmount: remainingAmount,
				status: remainingAmount === 0 ? 'completed' : 'pending',
				paymentStatus: 'CREDIT_NOTE',
			},
			{ where: { id: invoice_id }, transaction: t }
		);

		await t.commit();

		try {
			res.json({
				message: 'Credit note created successfully',
				invoice,
			});
		} catch (pdfError) {
			console.error('PDF generation failed:', pdfError);
			res.json({
				message: 'Invoice created successfully (PDF failed)',
				invoice,
			});
		}
	} catch (error) {
		await t.rollback();
		console.error(error);
		res
			.status(500)
			.json({ message: error.message || 'Error creating invoice' });
	}
});

function parseDate(d) {
	const [day, month, year] = d.split('/').map(Number);
	return new Date(year, month - 1, day); // month is 0-based
}

exports.getInvoices = catchAsync(async (req, res) => {
	const { org_id, role } = req.user;
	const { from_date, to_date } = req.query;
	const fromDate = new Date(parseDate(from_date));
	const toDate = new Date(parseDate(to_date));
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

	const invoices = await CreditNoteInvoice.findAndCountAll({
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
				model: Payment,
				as: 'payments',
				// include: {
				// 	model: PaymentInvoice,
				// 	as: 'receipt',
				// },
				separate: true,
				order: [['createdAt', 'ASC']],
			},
			{
				model: Invoice,
				as: 'invoice',
				attributes: ['id', 'invoicePrefix', 'invoiceNo', 'invoicePostfix'],
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
		offset,
		limit,
		order: [['createdAt', 'DESC']],
	});

	let response = invoices.rows.map((inv) => inv.get({ plain: true }));
	console.log('response ', response);

	if (invoices) {
		response = response.map((invoice) => {
			return {
				...invoice,
				paymentMsg: (() => {
					let message = null;
					const ref = [];
					console.log('invoice.payments ', invoice.payments);

					if (invoice.payments.length > 0) {
						const totalAmountPaid = invoice.payments.reduce(
							(acc, v) => acc + parseFloat(v.amount_adjusted),
							0
						);
						invoice.payments.forEach((payment, i) => {
							ref.push(
								`Ref-${i + 1}: Receipt No. ${payment.receiptPrefix || ''}${
									payment.receiptNumber
								}${payment.receiptPostfix || ''} - Payment of '${
									payment.amount
								}' paid through ${String(payment?.paymentType.toLowerCase())}.`
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

	res.status(200).json({
		message: 'Invoices loaded successfully',
		data: response,
		count: invoices.count,
	});
});

exports.getInvoiceById = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { org_id, role } = req.user;

	if (!org_id && role !== 'Admin') {
		throw AppError(`You don't authorize to access this api.`);
	}

	const invoice = await CreditNoteInvoice.findOne({
		where: { id, orgId: org_id },
		include: [
			{
				model: CreditNoteInvoiceItem,
				as: 'productItems',
				include: [
					{
						model: CreditNoteInvoiceItemSerial,
						as: 'serials',
					},
					{
						model: ProductBatch,
						as: 'batches',
					},
					{
						model: Product,
						as: 'product',
					},
					{
						model: ProductUOM,
						as: 'uoms',
						include: {
							model: Unit,
							as: 'unit',
							attributes: ['code', 'name'],
						},
					},
				],
			},
			{
				model: BusinessPartner,
				as: 'partner',
			},
		],
		order: [['createdAt', 'DESC']],
	});

	if (!invoice) {
		return res.status(404).json({ message: 'Invoice not found' });
	}

	const serialsData = await ProductSerial.findAll();
	const batchData = await ProductBatch.findAll();

	// Convert to plain object first
	const invoiceData = invoice.get({ plain: true });
	print(invoiceData, 'invoiceData => ');
	const response = {
		...invoiceData,
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
		})),
		additionalRemarks: invoiceData.remarks,
	};

	res
		.status(200)
		.json({ message: 'Invoice loaded successfully', data: response });
});

exports.updateInvoice = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { org_id, role } = req.user;

	if (!org_id && role !== 'Admin') {
		throw AppError(`You don't authorize to access this api.`);
	}

	const t = await sequelize.transaction();

	try {
		const invoice = await CreditNoteInvoice.findOne({
			where: { id, orgId: org_id },
			include: [
				{
					model: CreditNoteInvoiceItem,
					as: 'productItems',
					include: [
						{
							model: CreditNoteInvoiceItemSerial,
							as: 'serials',
						},
						{
							model: ProductBatch,
							as: 'batches',
						},
						{
							model: Product,
							as: 'product',
						},
						{
							model: Tax,
							as: 'tax',
						},
					],
				},
				{
					model: BusinessPartner,
					as: 'partner',
				},
				{
					model: OrganizationBankDetails,
					as: 'bankDetails',
				},
			],
		});
		if (!invoice) {
			return res.status(404).json({ message: 'Credit note not found' });
		}

		console.log('productsItemsFromOriginalInvoice ', invoice);

		const {
			invoice_id,
			orgId,
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
			customerInfo,
			invoiceDetail,
			productItems,
			paymentType,
			additionalNotes,
			customField1,
			customField2,
		} = req.body;

		const reverseStock = invoiceDetail.reverseStock;

		const isInvoiceExist = await Invoice.findOne({
			where: {
				id: invoice_id,
				orgId,
			},
			include: [
				{
					model: InvoiceItem,
					as: 'productItems',
					include: [
						{
							model: InvoiceItemSerial,
							as: 'serials',
						},
						{
							model: ProductBatch,
							as: 'batches',
						},
						{
							model: Product,
							as: 'product',
						},
						{
							model: ProductUOM,
							as: 'uoms',
							include: {
								model: Unit,
								as: 'unit',
								attributes: ['code', 'name'],
							},
						},
					],
				},
				{
					model: BusinessPartner,
					as: 'partner',
				},
			],
		});

		if (!isInvoiceExist) {
			return res.status(404).json({ message: 'Invoice not found' });
		}

		const productsItemsFromOriginalInvoice = invoice.get({
			plain: true,
		}).productItems;

		const isSerialDuplicate = checkForDuplicateSerials(productItems);

		if (isSerialDuplicate.status) {
			throw new AppError(
				`Duplicate serial numbers found in the invoice items: ${isSerialDuplicate.duplicateSerials.join(
					', '
				)}`,
				417
			);
		}

		// let uomQty = 1;
		// // 1️⃣ Revert previous stock first
		// for (const item of productsItemsFromOriginalInvoice) {
		// 	if (item.selected_uom_id > 0) {
		// 		uomQty = await uomConversion(
		// 			parseInt(item.qty),
		// 			parseInt(item.product_id),
		// 			parseInt(item.selected_uom_id)
		// 		);
		// 	}
		// 	if (item.stock_type === 'batch') {
		// 		await ProductBatch.increment(
		// 			{ qty: parseFloat(uomQty) },
		// 			{ where: { id: parseInt(item.batch_id) }, transaction: t }
		// 		);
		// 	} else if (item.stock_type === 'normal' && item.item_type === 'product') {
		// 		await Product.increment(
		// 			{ available_qty: parseFloat(uomQty) },
		// 			{ where: { id: parseInt(item.product_id) }, transaction: t }
		// 		);
		// 	} else if (item.stock_type === 'serial') {
		// 		await ProductSerial.update(
		// 			{ is_sell: 0 },
		// 			{
		// 				where: {
		// 					serial_no: {
		// 						[Op.in]: item.serials.map((s) => s.serial_no),
		// 					},
		// 				},
		// 				transaction: t,
		// 			}
		// 		);
		// 	}
		// }

		// 2️⃣ Remove old invoice items & serial mappings
		await CreditNoteInvoiceItemSerial.destroy({
			where: {
				credit_note_invoice_item_id: {
					[Op.in]: invoice.productItems.map((i) => i.id),
				},
			},
			transaction: t,
		});
		await CreditNoteInvoiceItem.destroy({
			where: { credit_note_invoice_id: invoice.id },
			transaction: t,
		});

		let uomQty = 1;
		// 3️⃣ Validate new stock before updating
		for (const item of productItems) {
			if (
				item.selected_uom_id > 0
			) {
				uomQty = await uomConversion(
					parseInt(item.qty),
					parseInt(item.product_id),
					parseInt(item.selected_uom_id)
				);
			}

			if (item.stock_type === 'batch') {
				// ✅ Check batch stock
				const batch = await ProductBatch.findByPk(item.batch_id);
				// console.log('isInvoiceExist ', isInvoiceExist.productItems);
				// return;
				if (!batch) {
					throw new AppError(
						`Batch not found for product ID ${item.product_id}`,
						417
					);
				}

				const existingBatch = await InvoiceItem.findOne({
					where: {
						invoice_id,
						batch_id: item.batch_id,
					},
				});
				// console.log('existingBatch ', existingBatch);
				// return;
				if (parseFloat(uomQty) > parseFloat(existingBatch.qty)) {
					// New Way
					// if (parseFloat(item.qty) > parseFloat(batch.qty)) { // Old Way
					throw new AppError(
						`Original batch quantity is ${existingBatch.qty}. But you are trying to create credit note with quantity ${item.qty} for batch ${batch.batch_no}.`,
						417
					);
				}
			} else if (item.stock_type === 'serial') {
				// ✅ Check serials exist and are unsold
				const serials = await ProductSerial.findAll({
					where: {
						serial_no: { [Op.in]: item.selectedSerials },
						is_sell: 1,
					},
				});

				const existingSerials = await InvoiceItemSerial.findAll({
					where: {
						invoice_item_id: invoice_id,
						serial_no: { [Op.in]: item.selectedSerials },
					},
				});
				// print({existingSerialLength: existingSerials.length,existingSerials, selected: item.selectedSerials});return;
				if (existingSerials.length !== item.selectedSerials.length) {
					throw new AppError(
						`Original serial numbers are ${existingSerials
							.map((s) => s.serial_no)
							.join(
								', '
							)}. But you are trying to create credit note with serial numbers ${item.selectedSerials.join(
							', '
						)} for product ${item.product_name}.`,
						// `Some serial numbers are invalid or already sold for product ID ${item.product_name}`,
						417
					);
				}
			} else if (item.stock_type === 'normal' && item.item_type === 'product') {
				// ✅ Check normal stock
				const product = await Product.findByPk(item.product_id);
				if (!product)
					throw new AppError(`Product not found for ID ${item.product_id}`);
				if (parseFloat(uomQty) > parseFloat(product.available_qty)) {
					// New Way
					// if (parseFloat(item.qty) > parseFloat(product.available_qty)) { // Old Way
					throw new AppError(
						`Insufficient stock for product ${product.name}. Available: ${product.available_qty}, Required: ${item.qty}`,
						417
					);
				}
			} else if (item.stock_type === 'normal' && item.item_type === 'service') {
				const isInvoiceItemExits = await InvoiceItem.findOne({
					where: { invoice_id: invoice_id, product_id: item.product_id },
				});
				console.log('uomQty ', { uomQty, itemQty: item.qty });

				if (isInvoiceItemExits)
					if (parseFloat(uomQty) > parseFloat(isInvoiceItemExits.qty)) {
						throw new AppError(
							`Original invoice item quantity is ${isInvoiceItemExits.qty}. But you are trying to create credit note with quantity ${item.qty} for service ${item.product_name}.`,
							417
						);
					}
			}
		}

		// 4️⃣ Update invoice master
		await invoice.update(
			{
				invoice_id,
				orgId,
				bank_id: bank_id !== 'null' ? bank_id : null,
				dueDate,
				invoicePrefix: invoiceDetail.invoicePrefix || null,
				invoiceNo: invoiceDetail.invoiceNumber || null,
				invoicePostfix: invoiceDetail.invoicePostfix || null,
				total_taxable: parseFloat(total_taxable || 0),
				total_tax: parseFloat(total_tax || 0),
				grandTotal: parseFloat(grandTotal || 0),
				isRoundOff,
				paymentType: payment_type,
				customerInfo,
				invoiceDetail,
				additionalNotes,
				customFields: [customField1, customField2],
				same_state: state_same,
				remarks: additionalRemarks,
				remainingAmount: grandTotal,
			},
			{ transaction: t }
		);
		console.log('productItems ', productItems);

		// 5️⃣ Recreate invoice items and adjust stock
		for (const item of productItems) {
			const invoiceItem = await CreditNoteInvoiceItem.create(
				{
					credit_note_invoice_id: invoice.id,
					product_id: item.product_id,
					batch_id:
						item.batch_id &&
						item.batch_id !== 'null' &&
						parseInt(item.batch_id) > 0
							? parseInt(item.batch_id)
							: null,
					hsn_sac_code:
						item.hsn_sac_code && item.hsn_sac_code !== 'null'
							? item.hsn_sac_code
							: null,
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
						item.selected_uom_id !== undefined &&
						item.selected_uom_id !== null &&
						+item.selected_uom_id !== -1
							? item.selected_uom_id
							: null,
				},
				{ transaction: t }
			);

			// ➤ Serial mapping
			if (item.stock_type === 'serial' && item.selectedSerials?.length) {
				await Promise.all(
					item.selectedSerials.map((serialNo) =>
						CreditNoteInvoiceItemSerial.create(
							{
								credit_note_invoice_item_id: invoiceItem.id,
								serial_no: serialNo.trim(),
							},
							{ transaction: t }
						)
					)
				);

				if (reverseStock) {
					await ProductSerial.update(
						{ is_sell: 0 },
						{
							where: { serial_no: { [Op.in]: item.selectedSerials } },
							transaction: t,
						}
					);
				}
			}

			if (
				item.selected_uom_id > 0 &&
				reverseStock
			) {
				const uomQty = await uomConversion(
					parseInt(item.qty),
					parseInt(item.product_id),
					parseInt(item.selected_uom_id)
				);
				// ➤ Deduct stock
				if (item.stock_type === 'batch') {
					await ProductBatch.increment(
						{ qty: parseFloat(uomQty) },
						{ where: { id: item.batch_id }, transaction: t }
					);
				} else if (
					item.stock_type === 'normal' &&
					item.item_type === 'product'
				) {
					await Product.increment(
						{ available_qty: parseFloat(uomQty) },
						{ where: { id: item.product_id }, transaction: t }
					);
				}
			}
		}

		// =========================================================
		// UPDATE PAYMENT DETAILS FOR CREDIT NOTE
		// =========================================================
		let creditNoteGrandTotal = parseFloat(grandTotal || 0);
		let isPaymentAdv = 0;
		let remainingAmount = isInvoiceExist.grandTotal;

		if (creditNoteGrandTotal >= remainingAmount) {
			remainingAmount = creditNoteGrandTotal - remainingAmount;
			isPaymentAdv = creditNoteGrandTotal - remainingAmount;
		} else {
			remainingAmount = remainingAmount - creditNoteGrandTotal;
		}

		const paymentRecord = await Payment.findOne({
			where: {
				credit_note_id: invoice.id,
			},
			transaction: t,
		});

		if (paymentRecord) {
			await paymentRecord.update(
				{
					orgId: orgId,
					type: 'INWARD',
					customer_id: customerInfo.customer_id,
					amount: parseFloat(grandTotal || 0),
					is_payment_adv: isPaymentAdv,
					advAmount: 0,
					paymentType: 'CREDIT_NOTE',
					remarks: 'AUTO GENERATED CREDIT NOTE PAYMENT',
					credit_note_id: invoice.id,
					updatedAt: new Date(),
				},
				{ transaction: t }
			);

			await Invoice.update(
				{ totalPaid: creditNoteGrandTotal },
				{ where: { id: invoice_id }, transaction: t }
			);

			// 2️⃣ Update the invoice totals
			await Invoice.update(
				{
					remainingAmount: remainingAmount,
					status: remainingAmount === 0 ? 'completed' : 'pending',
					paymentStatus: 'CREDIT_NOTE',
				},
				{ where: { id: invoice_id }, transaction: t }
			);
		}

		await t.commit();

		res.json({
			message: 'Credit note updated successfully',
			invoiceId: invoice.id,
		});
	} catch (error) {
		if (!t.finished) {
			await t.rollback();
		}
		console.error(error);
		res.status(500).json({
			message: error.message || 'Error updating credit note',
		});
	}
});

exports.deleteInvoice = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { org_id, role } = req.user;

	if (!org_id && role !== 'Admin') {
		throw AppError(`You don't authorize to access this api.`);
	}

	const t = await sequelize.transaction();

	try {
		const creditNote = await CreditNoteInvoice.findOne({
			where: { id, orgId: org_id },
			include: [
				{
					model: CreditNoteInvoiceItem,
					as: 'productItems',
					include: [
						{
							model: CreditNoteInvoiceItemSerial,
							as: 'serials',
						},
					],
				},
			],
		});
		if (!creditNote) {
			return res.status(404).json({ message: 'Credit note not found' });
		}

		const reverseStock = creditNote.invoiceDetail.reverseStock || false;

		// 1️⃣ Revert stock
		for (const item of creditNote.productItems) {
			if (item.stock_type === 'batch') {
				if (reverseStock) {
					await ProductBatch.increment(
						{ qty: -parseFloat(item.qty) },
						{ where: { id: parseInt(item.batch_id) }, transaction: t }
					);
				}
			} else if (item.stock_type === 'normal' && item.item_type === 'product') {
				if (reverseStock) {
					await Product.increment(
						{ available_qty: -parseFloat(item.qty) },
						{ where: { id: parseInt(item.product_id) }, transaction: t }
					);
				}
			} else if (item.stock_type === 'serial') {
				if (reverseStock) {
					await ProductSerial.update(
						{ is_sell: 1 },
						{
							where: {
								serial_no: {
									[Op.in]: item.serials.map((s) => s.serial_no),
								},
							},
							transaction: t,
						}
					);
				}
			}
		}

		const isPaymentExists = await Payment.findOne({
			where: { credit_note_id: creditNote.id },
		});

		if (isPaymentExists) {
			const existingInvoice = await Invoice.findOne({
				where: { id: creditNote.invoice_id },
			});

			if (!existingInvoice) {
				throw new AppError('Invoice not found');
			}

			const amountPaid = +isPaymentExists.amount;
			const invoiceGrandTotal = +existingInvoice.grandTotal;
			const invoiceTotalPaid = +existingInvoice.totalPaid - amountPaid;
			const remainingAmount = +existingInvoice.remainingAmount + amountPaid;

			existingInvoice.update({paymentStatus: 'PENDING', status: 'pending', totalPaid: invoiceTotalPaid, remainingAmount: remainingAmount}, {transaction: t})

			await Payment.destroy({
				where: {
					credit_note_id: creditNote.id,
				},
				transaction: t,
			});
		}

		await CreditNoteInvoiceItemSerial.destroy({
			where: {
				credit_note_invoice_item_id: {
					[Op.in]: creditNote.productItems.map((i) => i.id),
				},
			},
			transaction: t,
		});

		await CreditNoteInvoiceItem.destroy({
			where: { credit_note_invoice_id: creditNote.id },
			transaction: t,
		});

		await creditNote.destroy({ transaction: t });

		await t.commit();
		res.status(200).json({ message: 'Credit note deleted successfully' });
	} catch (error) {
		if (!t.finished) {
			await t.rollback();
		}
		console.error(error);
		res
			.status(500)
			.json({ message: error.message || 'Error deleting invoice' });
	}
});

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

exports.generateInvoiceNumber = catchAsync(async (req, res) => {
	const user = req.user;

	// let errorMsg = 'Invalid user or organization ID';
	// if (!user || !user.org_id || user.role !== 'Admin') {
	// 	if (user.role === 'Super Admin') {
	// 		errorMsg = 'As a super admin user you can\'t create a sale invoice.';
	// 	}
	// 	return res.status(400).json({ message: errorMsg });
	// }

	// Find the latest invoice with the given prefix and postfix
	const latestInvoice = await CreditNoteInvoice.findOne({
		where: {
			orgId: user.org_id,
		},
		order: [['createdAt', 'DESC']],
	});

	let newInvoiceNumber = 1;
	if (latestInvoice) {
		const latestNumber = parseInt(latestInvoice.invoiceNo, 10);
		if (!isNaN(latestNumber)) {
			newInvoiceNumber = latestNumber + 1;
		}
	}

	res.status(200).json({
		message: 'Generated credit note number successfully',
		invoiceNumber: newInvoiceNumber.toString().padStart(4, '0'),
	});
});

exports.generateInvoiceHtml = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;
		const { copies = [] } = req.body; // expecting ['original', 'duplicate', 'transport', 'office']
		// const copies = ['original', 'duplicate', 'transport', 'office'];
		const invoice = await CreditNoteInvoice.findByPk(id, {
			include: [
				{
					model: CreditNoteInvoiceItem,
					as: 'productItems',
					include: [
						{
							model: CreditNoteInvoiceItemSerial,
							as: 'serials',
						},
						{
							model: ProductBatch,
							as: 'batches',
						},
						{
							model: Product,
							as: 'product',
						},
						{
							model: Tax,
							as: 'tax',
						},
					],
				},
				{
					model: Invoice,
					as: 'invoice',
					attributes: ['id', 'invoicePrefix', 'invoiceNo', 'invoicePostfix', 'invoiceDetail'],
				},
				{
					model: BusinessPartner,
					as: 'partner',
				},
				{
					model: OrganizationBankDetails,
					as: 'bankDetails',
				},
			],
		});

		if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

		const response = await calculateSaleInvoice(invoice);

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
				'defaultCreditNoteTemplate'
			);
			combinedHtml += `
  <div class="preview-page">
    ${html}
  </div>
`;
		}

		res.json({ html: combinedHtml });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: 'Failed to generate HTML' });
	}
});

exports.downloadInvoicePdf = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;
		const { copies = [], html = '' } = req.body;

		const pdfPath = await generateInvoiceHTMLPDF(
			html,
			'defaultCreditNoteTemplate',
			{
				multi: true,
			}
		);

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
				0
		  )
		: 0;
	const totalSgst = invoiceData.same_state
		? invoiceData.productItems.reduce(
				(sum, item) => sum + parseFloat(item.sgst || 0),
				0
		  )
		: 0;
	const totalIgst = !invoiceData.same_state
		? invoiceData.productItems.reduce(
				(sum, item) => sum + parseFloat(item.igst || 0),
				0
		  )
		: 0;

	const state = await GstStateCode.findByPk(invoiceData.customerInfo.state_id);
	const userData = await User.findOne({
		where: { org_id: invoiceData.orgId, roleId: 2 },
		include: {
			model: organization,
			as: 'organization',
		},
	});
	let businessLogo = null;
	let business = null;
	if (userData) {
		business = userData.organization;
		business.address = `${business.org_address},<br>
${business.city} - ${business.pincode},<br>
${business.state}`;
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
		combineAgainstInvoiceNumber: `${invoiceData.invoice.invoicePrefix || ''}${
			invoiceData.invoice.invoiceNo || ''
		}${invoiceData.invoice.invoicePostfix || ''}`,
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
			0
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
			{ transaction: t }
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
					{ transaction: t }
				);

				await Invoice.increment(
					{ totalPaid: adjusted },
					{ where: { id: inv.id }, transaction: t }
				);

				// 2️⃣ Update the invoice totals
				const updated = await Invoice.update(
					{
						remainingAmount: remaining,
						status: remaining === 0 ? 'completed' : 'pending',
						paymentStatus: remaining === 0 ? paymentType : 'PARTIAL',
					},
					{ where: { id: inv.id }, transaction: t }
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
			{ where: { id }, transaction: t }
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
				{ where: { id: pi.invoice_id }, transaction: t }
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
							0
						);
						invoice.payments.forEach((payment, i) => {
							ref.push(
								`Ref-${i + 1}: Receipt No. ${payment.receipt.receiptPrefix}${
									payment.receipt.receiptNumber
								}${payment.receipt.receiptPostfix} - Payment of '${
									payment.amount_adjusted
								}' paid through ${String(
									payment?.receipt.paymentType.toLowerCase()
								)}.`
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
						}
					),
				},
			};
		});
	}

	const workbook = new ExcelJS.Workbook();
	const templatePath = path.join(
		__dirname,
		'../templates/sale-invoice-template.xlsx'
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

exports.getInvoicesNo = catchAsync(async (req, res) => {
	try {
		const { org_id } = req.user;
		const customerId = req.params.partnerId;
		const invoices = await Invoice.findAll({
			where: {
				customerId: customerId,
				orgId: org_id,
			},
			attributes: [
				'id',
				'invoicePrefix',
				'invoiceNo',
				'invoicePostfix',
				'invoiceDetail',
			],
		});
		console.log('invoices ', invoices);

		const invoiceData = invoices.map((inv) => inv.get({ plain: true }));
		let response = [];
		if (invoiceData) {
			response = invoiceData.map((inv) => ({
				...inv,
				invoice_number: `${inv.invoicePrefix || ''}${inv.invoiceNo || ''}${
					inv.invoicePostfix || ''
				}`,
				invoiceDate: inv.invoiceDetail.date,
			}));
		}

		res.status(200).json({
			message: 'Invoices no. fetched successfully',
			data: response,
		});
	} catch (error) {
		res.status(500).json({
			message: error.message || 'Error fetching invoices no.',
		});
	}
});

async function generatePayment() {
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
			{ transaction: t }
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
					{ transaction: t }
				);

				await Invoice.increment(
					{ totalPaid: adjusted },
					{ where: { id: inv.id }, transaction: t }
				);

				// 2️⃣ Update the invoice totals
				const updated = await Invoice.update(
					{
						remainingAmount: remaining,
						status: remaining === 0 ? 'completed' : 'pending',
						paymentStatus: remaining === 0 ? paymentType : 'PARTIAL',
					},
					{ where: { id: inv.id }, transaction: t }
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
}
