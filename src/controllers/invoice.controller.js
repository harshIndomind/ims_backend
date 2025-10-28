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
} = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { Op } = require('sequelize');
const { generateInvoicePDF } = require('../pdf/pdfGenerator');
const {
	generateInvoiceHTMLPDF,
	generateInvoiceHTML,
} = require('../pdf/htmlPdfGenerator');
const path = require('path');

exports.createInvoice = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const {
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

		const isSerialDuplicate = checkForDuplicateSerials(productItems);

		if (isSerialDuplicate.status) {
			throw new AppError(
				`Duplicate serial numbers found in the invoice items: ${isSerialDuplicate.duplicateSerials.join(
					', '
				)}`,
				417
			);
		}

		for (const item of productItems) {
			if (item.stock_type === 'batch') {
				// ✅ Check batch stock
				const batch = await ProductBatch.findByPk(item.batch_id);
				if (!batch)
					throw new AppError(
						`Batch not found for product ID ${item.product_id}`,
						417
					);
				if (parseFloat(item.qty) > parseFloat(batch.qty)) {
					throw new AppError(
						`Insufficient stock in batch ${batch.batch_no}. Available: ${batch.qty}, Required: ${item.qty}`,
						417
					);
				}
			} else if (item.stock_type === 'serial') {
				// ✅ Check serials exist and are unsold
				const serials = await ProductSerial.findAll({
					where: {
						serial_no: { [Op.in]: item.selectedSerials },
						is_sell: 0,
					},
				});

				if (serials.length !== item.selectedSerials.length) {
					throw new AppError(
						`Some serial numbers are invalid or already sold for product ID ${item.product_name}`,
						417
					);
				}
			} else if (item.stock_type === 'normal') {
				// ✅ Check normal stock
				const product = await Product.findByPk(item.product_id);
				if (!product)
					throw new AppError(`Product not found for ID ${item.product_id}`);
				if (parseFloat(item.qty) > parseFloat(product.available_qty)) {
					throw new AppError(
						`Insufficient stock for product ${product.name}. Available: ${product.available_qty}, Required: ${item.qty}`,
						417
					);
				}
			}
		}

		// 1️⃣ Create the Invoice
		const invoice = await Invoice.create(
			{
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
			},
			{ transaction: t }
		);

		for (const item of productItems) {
			const invoiceItem = await InvoiceItem.create(
				{
					invoice_id: invoice.id,
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
				},
				{ transaction: t }
			);

			// ➤ Create serial mapping
			if (item.stock_type === 'serial' && item.selectedSerials?.length) {
				await Promise.all(
					item.selectedSerials.map((serialNo) =>
						InvoiceItemSerial.create(
							{
								invoice_item_id: invoiceItem.id,
								serial_no: serialNo.trim(),
							},
							{ transaction: t }
						)
					)
				);

				// ➤ Mark serials as sold
				await ProductSerial.update(
					{ is_sell: 1 },
					{
						where: { serial_no: { [Op.in]: item.selectedSerials } },
						transaction: t,
					}
				);
			}

			// ➤ Deduct stock
			if (item.stock_type === 'batch') {
				await ProductBatch.increment(
					{ qty: -parseFloat(item.qty) },
					{ where: { id: item.batch_id }, transaction: t }
				);
			} else if (item.stock_type === 'normal') {
				await Product.decrement(
					{ available_qty: parseFloat(item.qty) },
					{ where: { id: item.product_id }, transaction: t }
				);
			}
		}

		await t.commit();

		try {
			res.json({
				message: 'Invoice created successfully',
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

exports.getInvoices = catchAsync(async (req, res) => {
	const { org_id, role } = req.user;

	if (!org_id && role !== 'Admin') {
		throw AppError(`You don't authorize to access this api.`);
	}

	const invoices = await Invoice.findAll(
		{
			where: { orgId: org_id },
			include: [
				{
					model: BusinessPartner,
					as: 'partner',
					attributes: ['name'],
				},
			],
			attributes: [
				'id',
				'invoicePrefix',
				'invoiceNo',
				'invoicePostfix',
				'dueDate',
				'grandTotal',
				'paymentType',
				'invoiceDetail',
				'status',
				'createdAt',
			],
			order: [['createdAt', 'DESC']],
		}
	);
	res
		.status(200)
		.json({ message: 'Invoices loaded successfully', data: invoices });
});

exports.getInvoiceById = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { org_id, role } = req.user;

	if (!org_id && role !== 'Admin') {
		throw AppError(`You don't authorize to access this api.`);
	}

	const invoice = await Invoice.findOne({
		where: { id, orgId: org_id },
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
		const invoice = await Invoice.findOne(
			{ where: { id, orgId: org_id } },
			{
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
			}
		);
		if (!invoice) {
			return res.status(404).json({ message: 'Invoice not found' });
		}

		const {
			orgId,
			bank_id,
			dueDate,
			total_taxable,
			total_tax,
			isRoundOff,
			grandTotal,
			payment_type,
			additionalRemarks,
			customerInfo,
			invoiceDetail,
			productItems,
			additionalNotes,
			customField1,
			customField2,
			state_same,
		} = req.body;

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

		// 1️⃣ Revert previous stock first
		for (const item of productsItemsFromOriginalInvoice) {
			if (item.stock_type === 'batch') {
				await ProductBatch.increment(
					{ qty: parseFloat(item.qty) },
					{ where: { id: parseInt(item.batch_id) }, transaction: t }
				);
			} else if (item.stock_type === 'normal') {
				await Product.increment(
					{ available_qty: parseFloat(item.qty) },
					{ where: { id: parseInt(item.product_id) }, transaction: t }
				);
			} else if (item.stock_type === 'serial') {
				await ProductSerial.update(
					{ is_sell: 0 },
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

		// 2️⃣ Remove old invoice items & serial mappings
		await InvoiceItemSerial.destroy({
			where: {
				invoice_item_id: { [Op.in]: invoice.productItems.map((i) => i.id) },
			},
			transaction: t,
		});
		await InvoiceItem.destroy({
			where: { invoice_id: invoice.id },
			transaction: t,
		});

		// 3️⃣ Validate new stock before updating
		for (const item of productItems) {
			if (item.stock_type === 'batch') {
				const batch = await ProductBatch.findByPk(item.batch_id, {
					transaction: t,
				});
				if (!batch)
					throw new AppError(
						`Batch not found for product ID ${item.product_id}`,
						417
					);

				if (parseFloat(item.qty) > parseFloat(batch.qty)) {
					throw new AppError(
						`Insufficient stock in batch ${batch.batch_no}. Available: ${batch.qty}, Required: ${item.qty}`,
						417
					);
				}
			} else if (item.stock_type === 'serial') {
				const serials = await ProductSerial.findAll({
					where: {
						serial_no: { [Op.in]: item.selectedSerials },
						is_sell: 0,
					},
					transaction: t,
				});

				if (serials.length !== item.selectedSerials.length) {
					throw new AppError(
						`Some serial numbers are invalid or already sold for product ${item.product_name}`,
						417
					);
				}
			} else if (item.stock_type === 'normal') {
				const product = await Product.findByPk(item.product_id, {
					transaction: t,
				});
				if (!product)
					throw new AppError(`Product not found for ID ${item.product_id}`);
				if (parseFloat(item.qty) > parseFloat(product.available_qty)) {
					throw new AppError(
						`Insufficient stock for product ${product.name}. Available: ${product.available_qty}, Required: ${item.qty}`,
						417
					);
				}
			}
		}

		// 4️⃣ Update invoice master
		await invoice.update(
			{
				orgId,
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
				same_state: state_same,
				remarks: additionalRemarks,
			},
			{ transaction: t }
		);
		console.log('productItems ', productItems);

		// 5️⃣ Recreate invoice items and adjust stock
		for (const item of productItems) {
			const invoiceItem = await InvoiceItem.create(
				{
					invoice_id: invoice.id,
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
				},
				{ transaction: t }
			);

			// ➤ Serial mapping
			if (item.stock_type === 'serial' && item.selectedSerials?.length) {
				await Promise.all(
					item.selectedSerials.map((serialNo) =>
						InvoiceItemSerial.create(
							{
								invoice_item_id: invoiceItem.id,
								serial_no: serialNo.trim(),
							},
							{ transaction: t }
						)
					)
				);

				await ProductSerial.update(
					{ is_sell: 1 },
					{
						where: { serial_no: { [Op.in]: item.selectedSerials } },
						transaction: t,
					}
				);
			}

			// ➤ Deduct stock
			if (item.stock_type === 'batch') {
				await ProductBatch.increment(
					{ qty: -parseFloat(item.qty) },
					{ where: { id: item.batch_id }, transaction: t }
				);
			} else if (item.stock_type === 'normal') {
				await Product.increment(
					{ available_qty: -parseFloat(item.qty) },
					{ where: { id: item.product_id }, transaction: t }
				);
			}
		}

		await t.commit();

		res.json({
			message: 'Invoice updated successfully',
			invoiceId: invoice.id,
		});
	} catch (error) {
		if (!t.finished) {
			await t.rollback();
		}
		console.error(error);
		res.status(500).json({
			message: error.message || 'Error updating invoice',
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
		const invoice = await Invoice.findOne(
			{ where: { id, orgId: org_id } },
			{
				include: [
					{
						model: InvoiceItem,
						as: 'productItems',
						include: [
							{
								model: InvoiceItemSerial,
								as: 'serials',
							},
						],
					},
				],
			}
		);
		if (!invoice) {
			return res.status(404).json({ message: 'Invoice not found' });
		}

		// 1️⃣ Revert stock
		for (const item of invoice.productItems) {
			if (item.stock_type === 'batch') {
				await ProductBatch.increment(
					{ qty: parseFloat(item.qty) },
					{ where: { id: parseInt(item.batch_id) }, transaction: t }
				);
			} else if (item.stock_type === 'normal') {
				await Product.increment(
					{ available_qty: parseFloat(item.qty) },
					{ where: { id: parseInt(item.product_id) }, transaction: t }
				);
			} else if (item.stock_type === 'serial') {
				await ProductSerial.update(
					{ is_sell: 0 },
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

		// 2️⃣ Delete invoice items & serial mappings
		await InvoiceItemSerial.destroy({
			where: {
				invoice_item_id: { [Op.in]: invoice.productItems.map((i) => i.id) },
			},
			transaction: t,
		});
		await InvoiceItem.destroy({
			where: { invoice_id: invoice.id },
			transaction: t,
		});

		// 3️⃣ Delete invoice
		await invoice.destroy({ transaction: t });

		await t.commit();
		res.status(200).json({ message: 'Invoice deleted successfully' });
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

	if (!user || !user.org_id || user.role !== 'Admin') {
		return res.status(400).json({ message: 'Invalid user or organization ID' });
	}

	// Find the latest invoice with the given prefix and postfix
	const latestInvoice = await Invoice.findOne({
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
		message: 'Generated invoice number successfully',
		invoiceNumber: newInvoiceNumber.toString().padStart(4, '0'),
	});
});

exports.generateInvoiceHtml = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;
		const { copies = [] } = req.body; // expecting ['original', 'duplicate', 'transport', 'office']
		// const copies = ['original', 'duplicate', 'transport', 'office'];
		const invoice = await Invoice.findByPk(id, {
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

		if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

		const serialsData = await ProductSerial.findAll();
		const batchData = await ProductBatch.findAll();
		const invoiceData = invoice.get({ plain: true });

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
					const discountAmount =
						parseFloat(item.discount) * parseFloat(item.qty);
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
				'defaultTemplate'
			);
			combinedHtml += `
  <div class="preview-page">
    ${html}
  </div>
`;
		}

		// const pdfPath = await generateInvoiceHTMLPDF(
		// 	combinedHtml,
		// 	'defaultTemplate',
		// 	{
		// 		multi: true,
		// 	}
		// );

		res.json({ html: combinedHtml });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: 'Failed to generate HTML' });
	}
});

exports.downloadInvoicePdf = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;
		const { copies = [] } = req.body;

		const invoice = await Invoice.findByPk(id, {
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

		if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

		const serialsData = await ProductSerial.findAll();
		const batchData = await ProductBatch.findAll();
		const invoiceData = invoice.get({ plain: true });

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
					const discountAmount =
						parseFloat(item.discount) * parseFloat(item.qty);
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
				'defaultTemplate'
			);
			combinedHtml += `
  <div class="preview-page">
    ${html}
  </div>
`;
		}

		const pdfPath = await generateInvoiceHTMLPDF(
			combinedHtml,
			'defaultTemplate',
			{
				multi: true,
			}
		);

		res.json({ pdfUrl: pdfPath });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: 'Failed to generate HTML' });
	}
});
