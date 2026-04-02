const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { purchaseOrderRepository } = require('../repository/index');
const logger = require('../utils/logger');
const { organization } = require('../models/index');

exports.createPurchaseOrder = async (req, payload) => {
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
					', ',
				)}`,
				417,
			);
		}

		for (const item of productItems) {
			let uomQty = item.qty;
			if (+item.selected_uom_id > 0) {
				uomQty = await uomConversion(
					parseInt(item.qty),
					parseInt(item.product_id),
					parseInt(item.selected_uom_id),
				);
			}
			if (item.stock_type === 'batch') {
				// ✅ Check batch stock
				const batch = await ProductBatch.findByPk(item.batch_id);
				if (!batch)
					throw new AppError(
						`Batch not found for product ID ${item.product_id}`,
						417,
					);
				if (parseFloat(uomQty) > parseFloat(batch.qty)) {
					// New Way
					// if (parseFloat(item.qty) > parseFloat(batch.qty)) { // Old Way
					throw new AppError(
						`Insufficient stock in batch ${batch.batch_no}. Available: ${batch.qty}, Required: ${item.qty}`,
						417,
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
						417,
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
						417,
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
				remainingAmount: grandTotal,
			},
			{ transaction: t },
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
					selected_uom_id:
						Number(item.selected_uom_id) > 0
							? Number(item.selected_uom_id)
							: null,
				},
				{ transaction: t },
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
							{ transaction: t },
						),
					),
				);

				// ➤ Mark serials as sold
				await ProductSerial.update(
					{ is_sell: 1 },
					{
						where: { serial_no: { [Op.in]: item.selectedSerials } },
						transaction: t,
					},
				);
			}

			uomQty = item.qty;
			if (+item.selected_uom_id > 0) {
				uomQty = await uomConversion(
					parseInt(item.qty),
					parseInt(item.product_id),
					parseInt(item.selected_uom_id),
				);
			}
			// ➤ Deduct stock
			if (item.stock_type === 'batch') {
				await ProductBatch.increment(
					{ qty: -parseFloat(uomQty) },
					{ where: { id: item.batch_id }, transaction: t },
				);
			} else if (item.stock_type === 'normal' && item.item_type === 'product') {
				await Product.increment(
					{ available_qty: -parseFloat(uomQty) },
					{ where: { id: item.product_id }, transaction: t },
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
};

exports.updatePurchaseOrder = async (id, payload) => {
	const { m_code, m_name } = payload;

	const purchaseOrder = await purchaseOrderRepository.findById(id);

	if (!purchaseOrder) {
		logger.warn('Purchase Order not found for update', { id });
		throw new AppError('Purchase Order not found', StatusCodes.NOT_FOUND);
	}

	await purchaseOrderRepository.update(purchaseOrder, {
		m_code,
		m_name,
	});

	logger.info('Purchase Order updated', {
		id,
	});

	return purchaseOrder;
};

exports.getAllPurchaseOrders = async (options = {}) => {
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

	const invoices = await Invoice.findAndCountAll({
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
			};
		});
	}

	res.status(200).json({
		message: 'Invoices loaded successfully',
		data: response,
		count: invoices.count,
	});
};

exports.getPurchaseOrderById = async (id) => {
	const purchaseOrder = await purchaseOrderRepository.findById(id);

	if (!purchaseOrder) {
		logger.warn('Purchase Order not found', { id });
		throw new AppError('Purchase Order not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Purchase Order fetched', { id });

	return purchaseOrder;
};

exports.deletePurchaseOrder = async (id) => {
	const purchaseOrder = await purchaseOrderRepository.findById(id);

	if (!purchaseOrder) {
		logger.warn('Purchase Order not found for delete', { id });
		throw new AppError('Purchase Order not found', StatusCodes.NOT_FOUND);
	}

	await purchaseOrderRepository.delete(purchaseOrder);

	logger.info('Purchase Order deleted', { id });

	return true;
};

exports.getPurchaseOrderNo = async (req) => {
	const user = req.user;

	let errorMsg = 'Invalid user or organization ID';
	if (!user || !user.org_id || user.role !== 'Admin') {
		if (user.role === 'Super Admin') {
			errorMsg = "As a super admin user you can't create a sale invoice.";
		}
		return res.status(400).json({ message: errorMsg });
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
    
    return newInvoiceNumber.toString().padStart(4, '0');
};
