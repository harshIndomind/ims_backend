const {
	Invoice,
	BusinessPartner,
	sequelize,
	Payment,
	PaymentInvoice,
} = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { Op } = require('sequelize');
const path = require('path');
const ExcelJS = require('exceljs');
const { BASE_URL } = require('../config/serverConfig');
const { format } = require('date-fns');
const moment = require('moment');

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
			row.getCell(2).value = inv.invoiceNo; // Invoice No.
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
