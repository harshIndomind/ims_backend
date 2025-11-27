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
	CreditNoteInvoice
} = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { Op, Sequelize } = require('sequelize');
const { generateInvoicePDF } = require('../pdf/pdfGenerator');
const {
	generateInvoiceHTMLPDF,
	generateInvoiceHTML,
} = require('../pdf/htmlPdfGenerator');
const path = require('path');
const ExcelJS = require('exceljs');
const { BASE_URL } = require('../config/serverConfig');
const { print } = require('../utils/common');

function isInterstate(placeOfSupply, supplierState) {
	if (!placeOfSupply || !supplierState) return false;
	return (
		placeOfSupply.trim().toLowerCase() !== supplierState.trim().toLowerCase()
	);
}

// Simple classifier for which GSTR-1 section the invoice belongs to
function classifyInvoice(inv, supplierState = 'UNKNOWN') {
	const buyerGstin = (inv.buyerGstin || '').toString().trim();
	const invoiceValue = Number(inv.invoiceValue || inv.taxableValue || 0);
	const interstate = isInterstate(inv.placeOfSupply || '', supplierState);

	if (buyerGstin && buyerGstin.length >= 15) {
		return 'b2b';
	}

	if (!buyerGstin && invoiceValue > 250000) {
		return 'b2cl';
	}

	// default unregistered consumer
	return 'b2cs';
}

function addHeader(worksheet, headers) {
	worksheet.columns = headers.map((h) => ({
		header: h,
		key: h.replace(/\s+/g, '_').toLowerCase(),
		width: Math.max(12, h.length + 2),
	}));
	worksheet.autoFilter = {
		from: 'A1',
		to: String.fromCharCode(65 + headers.length - 1) + '1',
	};
}

// function pushInvoiceRow(ws, inv) {
// 	// Normalize values so that keys match header keys created in addHeader
// 	const row = {
// 		invoice_number: inv.invoiceNumber || inv.invNo || '',
// 		invoice_date: inv.invoiceDate || inv.date || '',
// 		buyer_name: inv.buyerName || inv.customerName || '',
// 		buyer_gstin: inv.buyerGstin || '',
// 		place_of_supply: inv.placeOfSupply || '',
// 		taxable_value:
// 			typeof inv.taxableValue !== 'undefined'
// 				? inv.taxableValue
// 				: inv.invoiceValue || 0,
// 		igst: inv.igst || 0,
// 		cgst: inv.cgst || 0,
// 		sgst: inv.sgst || 0,
// 		invoice_value:
// 			inv.invoiceValue ||
// 			(inv.taxableValue || 0) +
// 				(inv.igst || 0) +
// 				(inv.cgst || 0) +
// 				(inv.sgst || 0),
// 		reverse_charge: inv.reverseCharge ? 'Y' : 'N',
// 		supply_type: inv.supplyType || inv.itemType || '',
// 		remarks: inv.remarks || '',
// 	};

// 	ws.addRow(row);
// }

function pushInvoiceB2BRow(sheet, inv, rowNum) {
	const row = sheet.getRow(rowNum);

	row.getCell(1).value = inv.buyerGstin;
	row.getCell(2).value = inv.buyerName;
	row.getCell(3).value = inv.invoiceNumber;
	row.getCell(4).value = new Date(inv.invoiceDate);
	row.getCell(5).value = inv.invoiceValue;
	row.getCell(6).value = `${inv.stateCode}-${inv.placeOfSupply}`;
	row.getCell(7).value = inv.reverseCharge ? 'Y' : 'N';
	row.getCell(8).value = '';
	row.getCell(9).value = inv.invoiceType;
	row.getCell(10).value = '';
	row.getCell(11).value = inv.rate;
	row.getCell(12).value = inv.taxableValue;
	row.getCell(13).value = 0;
	row.commit();
}

function pushInvoiceB2CLRow(sheet, inv, rowNum) {
	const row = sheet.getRow(rowNum);
	row.getCell(1).value = inv.invoiceNumber;
	row.getCell(2).value = new Date(inv.invoiceDate);
	row.getCell(3).value = inv.invoiceValue;
	row.getCell(4).value = inv.placeOfSupply;
	row.getCell(5).value = '';
	row.getCell(6).value = inv.rate;
	row.getCell(7).value = inv.taxableValue;
	row.getCell(8).value = 0;
	row.commit();
}

function pushInvoiceB2CSRow(sheet, inv, rowNum) {
	const row = sheet.getRow(rowNum);
	row.getCell(1).value = 'OE';
	row.getCell(2).value = inv.placeOfSupply;
	row.getCell(3).value = '';
	row.getCell(4).value = inv.rate;
	row.getCell(5).value = inv.taxableValue;
	row.getCell(6).value = 0;
	row.getCell(7).value = '';

	row.commit();
}

exports.generateGSTR1 = catchAsync(async (req, res) => {
	try {
		const invoicesDataForHSNReport = await getInvoicesDataForHSNReport(req);
		const invoicesData = await getInvoices(req);
		const getGSTR1Docs = await getGSTR1DocsReport(req);

		const supplierStateData = await GstStateCode.findByPk(req.user.state_id);

		if (!supplierStateData) {
			return res.status(400).json({ error: 'Supplier state is not found!' });
		}

		// console.log('invoicesData, ', {
		// 	supplierState: supplierStateData.state_name,
		// 	invoices: invoicesData,
		// });
		const payload = {
			supplierState: supplierStateData.state_name,
			invoices: invoicesData,
		};
		const invoices = Array.isArray(payload.invoices) ? payload.invoices : [];
		const supplierState = (payload.supplierState || '').trim(); // optional, helps decide interstate

		if (!invoices.length)
			return res
				.status(400)
				.json({ error: 'No invoices provided. Send { invoices: [ ... ] }' });

		// const workbook = new ExcelJS.Workbook();
		// workbook.creator = 'GSTR-1 Generator';
		// workbook.created = new Date();

		const workbook = new ExcelJS.Workbook();
		const templatePath = path.join(__dirname, '../templates/GSTR-1.xlsx'); // your existing file
		await workbook.xlsx.readFile(templatePath);

		const b2b = workbook.getWorksheet('b2b');
		const b2cl = workbook.getWorksheet('b2cl');
		const b2cs = workbook.getWorksheet('b2cs');

		const hsnb2b = workbook.getWorksheet('hsn(b2b)');
		const hsnb2c = workbook.getWorksheet('hsn(b2c)');
		const docs = workbook.getWorksheet('docs');

		// addHeader(b2b, headers);
		// addHeader(b2cl, headers);
		// addHeader(b2cs, headers);

		// const sheet = workbook.getWorksheet('b2b'); // or 'Sheet1' — change as per your file

		// 3️⃣ Find the starting row (for example, start from row 5)
		let startB2bRow = 5;
		let startB2clRow = 5;
		let startB2csRow = 5;
		let startHsnb2bRow = 5;
		let startHsnb2cRow = 5;
		let startDocsRow = 5;

		// Fill rows
		// invoices.forEach((inv) => {
		// 	const cat = classifyInvoice(inv, supplierState);
		// 	if (cat === 'b2b') pushInvoiceRow(b2b, inv);
		// 	else if (cat === 'b2cl') pushInvoiceRow(b2cl, inv);
		// 	else pushInvoiceRow(b2cs, inv);
		// });

		const allCategory = {
			b2b: { body: [] },
			b2cl: [],
			b2cs: [],
		};

		invoices.forEach((inv) => {
			const cat = classifyInvoice(inv, supplierState);
			if (cat === 'b2b') {
				allCategory['b2b'].body.push(inv);
				pushInvoiceB2BRow(b2b, inv, startB2bRow++);
			} else if (cat === 'b2cl') {
				allCategory['b2cl'].push(inv);
				pushInvoiceB2CLRow(b2cl, inv, startB2clRow++);
			} else {
				allCategory['b2cs'].push(inv);
				pushInvoiceB2CSRow(b2cs, inv, startB2csRow++);
			}
		});

		if (allCategory['b2b'].body.length > 0) {
			const b2bRow = b2b.getRow(3);
			const totalNoInvoices = Array.from(
				new Map(
					allCategory['b2b'].body?.map((i) => [i.invoiceNumber, i]) || []
				).values()
			).length;

			const totalNoReceipients = new Set(
				Array.from(
					new Map(
						allCategory['b2b'].body?.map((i) => [i.invoiceNumber, i]) || []
					).values()
				).map((item) => item.buyerGstin)
			).size;

			b2bRow.getCell(1).value = totalNoReceipients; // No. of Recipients
			b2bRow.getCell(3).value = totalNoInvoices; // No. of invoices
			// b2bRow.getCell(5).value = allCategory['b2b'].reduce(
			// 	(acc, val) => acc + parseFloat(val.invoiceValue),
			// 	0
			// );

			const totalInvoiceValue = Array.from(
				new Map(
					allCategory['b2b'].body?.map((i) => [i.invoiceNumber, i]) || []
				).values()
			).reduce((acc, val) => acc + parseFloat(val.invoiceValue || 0), 0);

			b2bRow.getCell(5).value = totalInvoiceValue;
			const totalTaxableValue = allCategory['b2b'].body.reduce(
				(acc, val) => acc + parseFloat(val.taxableValue),
				0
			); // Total Taxable Value
			b2bRow.getCell(12).value = totalTaxableValue;
			b2bRow.getCell(13).value = 0; //Cess

			allCategory['b2b'].total = {
				totalNoReceipients,
				totalNoInvoices,
				totalInvoiceValue,
				totalTaxableValue,
			};

			b2bRow.commit();
		}
		// console.log("allCategory['b2b'] ", allCategory['b2b']);

		if (allCategory['b2cl'].length > 0) {
			const b2clRow = b2cl.getRow(3);
			b2clRow.getCell(1).value = allCategory['b2cl'].length; // No. of Recipients
			b2clRow.getCell(3).value = allCategory['b2cl'].reduce(
				(acc, val) => acc + parseFloat(val.invoiceValue),
				0
			); // Total of invoice value
			b2clRow.getCell(7).value = allCategory['b2cl'].reduce(
				(acc, val) => acc + parseFloat(val.taxableValue),
				0
			); // Total Taxable Value
			b2clRow.getCell(8).value = 0; //Cess
			b2clRow.commit();
		}

		if (allCategory['b2cs'].length > 0) {
			const b2csRow = b2cs.getRow(3);
			b2csRow.getCell(5).value = allCategory['b2cs'].reduce(
				(acc, val) => acc + parseFloat(val.taxableValue),
				0
			); // Total Taxable Value
			b2csRow.getCell(6).value = 0; //Cess
			b2csRow.commit();
		}

		if (invoicesDataForHSNReport) {
			if (invoicesDataForHSNReport['hsn(b2b)'].body.length > 0) {
				const totals = invoicesDataForHSNReport['hsn(b2b)'].totals;
				const header = hsnb2b.getRow(3);
				header.getCell(1).value = totals.totalHsnNo; // Total HSN No.
				header.getCell(5).value = totals.totalValue; // Total Value
				header.getCell(7).value = totals.taxableValue; // Total Taxable Value
				header.getCell(8).value = totals.igst; // Total IGST
				header.getCell(9).value = totals.cgst; // Total CGST
				header.getCell(10).value = totals.sgst; // Total SGST
				header.getCell(11).value = 0; // Total CESS
				header.commit();
				invoicesDataForHSNReport['hsn(b2b)'].body.forEach((item) => {
					const row = hsnb2b.getRow(startHsnb2bRow++);
					row.getCell(1).value = item.hsnSacCode; //HSN
					row.getCell(2).value = item.productName; //Description
					row.getCell(3).value = item.uqc; //UQC
					row.getCell(4).value = item.totalQty; //Total Quantity
					row.getCell(5).value = item.totalValue; //Total Value
					row.getCell(6).value = item.rate; // Tax Rate
					row.getCell(7).value = item.taxableValue; // Taxable Value
					row.getCell(8).value = item.igst; // Integrated Tax Amount
					row.getCell(9).value = item.cgst; // Central Tax Amount
					row.getCell(10).value = item.sgst; // State/UT Tax Amount
					row.getCell(11).value = 0.0; // Cess Amount
					row.commit();
				});
			}

			if (invoicesDataForHSNReport['hsn(b2c)'].body.length > 0) {
				const totals = invoicesDataForHSNReport['hsn(b2c)'].totals;
				const header = hsnb2c.getRow(3);
				header.getCell(1).value = totals.totalHsnNo; // Total HSN No.
				header.getCell(5).value = totals.totalValue; // Total Value
				header.getCell(7).value = totals.taxableValue; // Total Taxable Value
				header.getCell(8).value = totals.igst; // Total IGST
				header.getCell(9).value = totals.cgst; // Total CGST
				header.getCell(10).value = totals.sgst; // Total SGST
				header.getCell(11).value = 0; // Total CESS
				header.commit();
				invoicesDataForHSNReport['hsn(b2c)'].body.forEach((item) => {
					const row = hsnb2c.getRow(startHsnb2cRow++);
					row.getCell(1).value = item.hsnSacCode; //HSN
					row.getCell(2).value = item.productName; //Description
					row.getCell(3).value = item.uqc; //UQC
					row.getCell(4).value = item.totalQty; //Total Quantity
					row.getCell(5).value = item.totalValue; //Total Value
					row.getCell(6).value = item.rate; // Tax Rate
					row.getCell(7).value = item.taxableValue; // Taxable Value
					row.getCell(8).value = item.igst; // Integrated Tax Amount
					row.getCell(9).value = item.cgst; // Central Tax Amount
					row.getCell(10).value = item.sgst; // State/UT Tax Amount
					row.getCell(11).value = 0.0; // Cess Amount
					row.commit();
				});
			}

			if (getGSTR1Docs) {
				// const totals = invoicesDataForHSNReport['hsn(b2c)'].totals;
				const header = docs.getRow(3);
				const totalNumber = getGSTR1Docs.reduce((acc, item) => acc + item.totalNumber, 0);
				const cancelledNumber = getGSTR1Docs.reduce((acc, item) => acc + item.cancelled, 0);
				console.log("totalNumbers ",  {totalNumber, cancelledNumber});
				
				header.getCell(4).value = String(totalNumber); // Total HSN No.
				header.getCell(5).value = String(cancelledNumber); // Total Value
			
				header.commit();
				getGSTR1Docs.forEach((item) => {
					const row = docs.getRow(startDocsRow++);
					row.getCell(1).value = item.title; //HSN
					row.getCell(2).value = item.start; //Description
					row.getCell(3).value = item.end; //UQC
					row.getCell(4).value = item.totalNumber; //Total Quantity
					row.getCell(5).value = item.cancelled; //Total Value
					row.commit();
				});
			}
		}


		// Auto-size first sheet columns a bit more and set date formats
		[b2b, b2cl, b2cs].forEach((ws) => {
			ws.columns.forEach((col) => {
				col.width = Math.max(col.width, 30);
			});
			// If invoice_date column exists, set numFmt for that column (column B)
			const dateCol = ws.getColumn(2);
			dateCol.numFmt = 'dd-mm-yyyy';
		});

		// Generate buffer and send
		// res.setHeader(
		// 	'Content-Type',
		// 	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		// );
		// res.setHeader('Content-Disposition', 'attachment; filename="gstr1.xlsx"');
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

		const fileName = formatted + '_gstr1.xlsx';
		const tmpPath = path.join(__dirname, `../../storage/invoices/${fileName}`);
		await workbook.xlsx.writeFile(tmpPath);

		const baseUrl = BASE_URL || 'http://localhost:5000';

		const fileDownloadPath = `${baseUrl}/storage/invoices/${fileName}`;

		res.json({
			message: 'GSTR-1 report generated.',
			data: {
				rows: { ...allCategory, ...invoicesDataForHSNReport, docs: getGSTR1Docs },
				path: fileDownloadPath,
			},
		});
	} catch (err) {
		console.error('Error generating GSTR-1 Excel:', err);
		res
			.status(500)
			.json({ error: 'Failed to generate Excel', details: err.message });
	}
});

function parseDate(d) {
	const [day, month, year] = d.split('/').map(Number);
	return new Date(year, month - 1, day); // month is 0-based
}

async function getInvoices(req) {
	const { org_id, role } = req.user;
	const { from_date, to_date } = req.body;

	const fromDate = parseDate(from_date);
	const toDate = parseDate(to_date);

	// Ensure valid dates
	if (isNaN(fromDate) || isNaN(toDate)) {
		throw new Error('Invalid date range');
	}
	toDate.setHours(23, 59, 59, 999);

	if (!org_id && role !== 'Admin') {
		throw AppError(`You don't authorize to access this api.`);
	}

	const invoice = await Invoice.findAll({
		where: {
			orgId: org_id,
			createdAt: {
				[Op.between]: [fromDate, toDate],
			},
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
						model: Tax,
						as: 'tax',
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
	// console.log('invoice ', invoice);

	const invoiceData = invoice.map((i) => i.get({ plain: true }));

	const response = [];

	for (const inv of invoiceData) {
		// Get state info
		const state = await GstStateCode.findByPk(inv.customerInfo?.state_id);

		// Group productItems by tax_id
		const groupedItems =
			inv.productItems?.reduce((acc, item) => {
				const taxId = item.tax_id || 'no_tax';
				if (!acc[taxId]) acc[taxId] = [];
				acc[taxId].push(item);
				return acc;
			}, {}) || {};

		// Loop through each tax group to create a separate record
		for (const [taxId, items] of Object.entries(groupedItems)) {
			// console.log("items ", items);

			// Aggregate tax values for this group
			const { taxableValue, igst, cgst, sgst } = items.reduce(
				(acc, item) => ({
					taxableValue:
						acc.taxableValue +
						parseFloat(item.price || 0) * parseFloat(item.qty || 0),
					igst: acc.igst + parseFloat(item.igst || 0),
					cgst: acc.cgst + parseFloat(item.cgst || 0),
					sgst: acc.sgst + parseFloat(item.sgst || 0),
				}),
				{ taxableValue: 0, igst: 0, cgst: 0, sgst: 0 }
			);

			// Common info from invoice
			const invoiceNumber = `${inv.invoicePrefix || ''}${inv.invoiceNo || ''}${
				inv.invoicePostfix || ''
			}`;

			const invoiceDate = inv.invoiceDetail?.date
				? new Date(inv.invoiceDetail.date)
						.toLocaleDateString('en-IN', {
							day: '2-digit',
							month: 'short',
							year: 'numeric',
						})
						.replace(/ /g, '-')
				: '';

			// Push a separate record per tax_id group
			response.push({
				invoiceNumber,
				stateCode: state?.gst_code_padded || '',
				invoiceDate,
				buyerName: inv.partner?.name || '',
				buyerGstin: inv.partner?.gstin || '',
				placeOfSupply: state?.state_name || '',
				tax_id: taxId,
				taxableValue,
				igst,
				cgst,
				sgst,
				invoiceValue: parseFloat(inv.grandTotal || 0),
				reverseCharge: false,
				supplyType: 'goods',
				invoiceType: inv.invoiceDetail?.invoiceType || '',
				rate: items[0].tax.rate,
			});
		}
	}
	// console.log("response ", response);

	return response || [];
}

async function getInvoicesDataForHSNReport(req) {
	const { org_id, role } = req.user;
	const { from_date, to_date } = req.body;

	const fromDate = parseDate(from_date);
	const toDate = parseDate(to_date);

	// Ensure valid dates
	if (isNaN(fromDate) || isNaN(toDate)) {
		throw new Error('Invalid date range');
	}
	toDate.setHours(23, 59, 59, 999);

	if (!org_id && role !== 'Admin') {
		throw AppError(`You don't authorize to access this api.`);
	}

	const invoice = await Invoice.findAll({
		where: {
			orgId: org_id,
			createdAt: {
				[Op.between]: [fromDate, toDate],
			},
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
						model: Tax,
						as: 'tax',
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

	const invoiceData = invoice.map((i) => i.get({ plain: true }));

	const response = [];

	for (const inv of invoiceData) {
		const state = await GstStateCode.findByPk(inv.customerInfo?.state_id);

		const groupedItems =
			inv.productItems?.reduce((acc, item) => {
				const hsnSacCode = item.hsn_sac_code?.trim();

				// Skip if hsn_sac_code is empty
				if (!hsnSacCode) return acc;

				// Initialize array if not present
				if (!acc[hsnSacCode]) acc[hsnSacCode] = [];

				// Push item
				acc[hsnSacCode].push(item);

				return acc;
			}, {}) || {};

		for (const [hsnSacCode, items] of Object.entries(groupedItems)) {
			const { taxableValue, igst, cgst, sgst, totalQty, productName } =
				items.reduce(
					(acc, item) => ({
						taxableValue:
							acc.taxableValue +
							parseFloat(item.price || 0) * parseFloat(item.qty || 0),
						igst: acc.igst + parseFloat(item.igst || 0),
						cgst: acc.cgst + parseFloat(item.cgst || 0),
						sgst: acc.sgst + parseFloat(item.sgst || 0),
						totalQty: acc.totalQty + parseFloat(item.qty || 0),
						productName: [...acc.productName, item.product?.name || ''],
					}),
					{
						taxableValue: 0,
						igst: 0,
						cgst: 0,
						sgst: 0,
						totalQty: 0,
						productName: [],
					}
				);

			const invoiceNumber = `${inv.invoicePrefix || ''}${inv.invoiceNo || ''}${
				inv.invoicePostfix || ''
			}`;

			response.push({
				invoiceNumber,
				stateCode: state?.gst_code_padded || '',
				buyerName: inv.partner?.name || '',
				buyerGstin: inv.partner?.gstin || '',
				placeOfSupply: state?.state_name || '',
				totalQty,
				totalValue: taxableValue + (igst + cgst + sgst),
				taxableValue,
				igst,
				cgst,
				sgst,
				uqc: 'OTH-OTHERS',
				productName: productName.join(', '),
				hsnSacCode,
				rate: items[0].tax.rate,
			});
		}
	}

	const separate = response.reduce(
		(acc, item) => {
			if (item.buyerGstin && item.buyerGstin.trim() !== '') {
				acc['hsn(b2b)'].body.push(item);
			} else {
				acc['hsn(b2c)'].body.push(item);
			}
			return acc;
		},
		{
			'hsn(b2b)': { body: [], totals: {} },
			'hsn(b2c)': { body: [], totals: {} },
		}
	);

	const hsnB2BSummary = Object.values(
		separate['hsn(b2b)'].body.reduce((acc, item) => {
			const hsn = item.hsnSacCode?.trim();
			if (!hsn) return acc;

			if (!acc[hsn]) {
				acc[hsn] = {
					hsnSacCode: hsn,
					productName: new Set(),
					totalQty: 0,
					taxableValue: 0,
					totalValue: 0,
					igst: 0,
					cgst: 0,
					sgst: 0,
					rate: item.rate,
					uqc: item.uqc,
				};
			}

			acc[hsn].productName.add(item.productName);
			acc[hsn].totalQty += parseFloat(item.totalQty || 0);
			acc[hsn].taxableValue += parseFloat(item.taxableValue || 0);
			acc[hsn].totalValue += parseFloat(item.totalValue || 0);
			acc[hsn].igst += parseFloat(item.igst || 0);
			acc[hsn].cgst += parseFloat(item.cgst || 0);
			acc[hsn].sgst += parseFloat(item.sgst || 0);

			return acc;
		}, {})
	).map((item) => ({
		...item,
		productName: Array.from(item.productName).join(', '),
	}));

	// ✅ Step: Generate HSN Summary for B2C
	const hsnB2CSummary = Object.values(
		separate['hsn(b2c)'].body.reduce((acc, item) => {
			const hsn = item.hsnSacCode?.trim();
			if (!hsn) return acc;

			if (!acc[hsn]) {
				acc[hsn] = {
					hsnSacCode: hsn,
					productName: new Set(),
					totalQty: 0,
					taxableValue: 0,
					totalValue: 0,
					igst: 0,
					cgst: 0,
					sgst: 0,
					rate: item.rate,
					uqc: item.uqc,
				};
			}

			acc[hsn].productName.add(item.productName);
			acc[hsn].totalQty += parseFloat(item.totalQty || 0);
			acc[hsn].taxableValue += parseFloat(item.taxableValue || 0);
			acc[hsn].totalValue += parseFloat(item.totalValue || 0);
			acc[hsn].igst += parseFloat(item.igst || 0);
			acc[hsn].cgst += parseFloat(item.cgst || 0);
			acc[hsn].sgst += parseFloat(item.sgst || 0);

			return acc;
		}, {})
	).map((item) => ({
		...item,
		productName: Array.from(item.productName).join(', '),
	}));

	separate['hsn(b2b)']['body'] = hsnB2BSummary;
	separate['hsn(b2c)']['body'] = hsnB2CSummary;

	// ✅ Calculate B2B totals
	separate['hsn(b2b)'].totals = separate['hsn(b2b)'].body.reduce(
		(acc, item) => {
			const hsn = item.hsnSacCode?.trim();
			if (hsn && !acc._hsnSet.has(hsn)) {
				acc._hsnSet.add(hsn);
				acc.totalHsnNo += 1;
			}

			acc.totalValue += parseFloat(item.totalValue || 0);
			acc.taxableValue += parseFloat(item.taxableValue || 0);
			acc.igst += parseFloat(item.igst || 0);
			acc.cgst += parseFloat(item.cgst || 0);
			acc.sgst += parseFloat(item.sgst || 0);

			return acc;
		},
		{
			totalHsnNo: 0,
			totalValue: 0,
			taxableValue: 0,
			igst: 0,
			cgst: 0,
			sgst: 0,
			_hsnSet: new Set(), // internal tracker for unique HSNs
		}
	);

	// ✅ Calculate B2C totals
	separate['hsn(b2c)'].totals = separate['hsn(b2c)'].body.reduce(
		(acc, item) => {
			const hsn = item.hsnSacCode?.trim();
			if (hsn && !acc._hsnSet.has(hsn)) {
				acc._hsnSet.add(hsn);
				acc.totalHsnNo += 1;
			}

			acc.totalValue += parseFloat(item.totalValue || 0);
			acc.taxableValue += parseFloat(item.taxableValue || 0);
			acc.igst += parseFloat(item.igst || 0);
			acc.cgst += parseFloat(item.cgst || 0);
			acc.sgst += parseFloat(item.sgst || 0);

			return acc;
		},
		{
			totalHsnNo: 0,
			totalValue: 0,
			taxableValue: 0,
			igst: 0,
			cgst: 0,
			sgst: 0,
			_hsnSet: new Set(), // internal tracker for unique HSNs
		}
	);

	// console.log({
	// 	b2b: hsnB2BSummary,
	// 	b2c: hsnB2CSummary,
	// });

	// console.log('separate ', JSON.stringify(separate));

	return separate || [];
}

async function getGSTR1DocsReport(req) {
	const { org_id, role } = req.user;
	const { from_date, to_date } = req.body;

	const fromDate = parseDate(from_date);
	const toDate = parseDate(to_date);

	// Ensure valid dates
	if (isNaN(fromDate) || isNaN(toDate)) {
		throw new Error('Invalid date range');
	}
	toDate.setHours(23, 59, 59, 999);

	if (!org_id && role !== 'Admin') {
		throw AppError(`You don't authorize to access this api.`);
	}

	const invoice = await Invoice.findAll({
		where: {
			orgId: org_id,
			createdAt: {
				[Op.between]: [fromDate, toDate],
			},
		},
		attributes: ['id', 'invoicePrefix', 'invoiceNo', 'invoicePostfix'],
		order: [['createdAt', 'ASC']],
	});

	if (!invoice) {
		return res.status(404).json({ message: 'Invoice not found' });
	}

	const invoiceData = invoice.map((i) => i.get({ plain: true }));

	const groups = {};

	invoiceData.forEach((inv) => {
		const prefix = inv.invoicePrefix || '';
		const postfix = inv.invoicePostfix || '';
		const key = prefix + '|' + postfix;

		if (!groups[key]) groups[key] = [];

		groups[key].push(inv);
	});

	const result = [];

	Object.keys(groups).forEach((key) => {
		const [prefix, postfix] = key.split('|');

		// sort by numeric invoiceNo
		const sorted = groups[key].sort(
			(a, b) => Number(a.invoiceNo) - Number(b.invoiceNo)
		);

		const startNo = sorted[0].invoiceNo;
		const endNo = sorted[sorted.length - 1].invoiceNo;

		result.push({
			title: 'Invoices for outward supply',
			prefix: prefix,
			start: prefix + startNo + (postfix || ''),
			end: prefix + endNo + (postfix || ''),
			totalNumber: sorted.length,
			cancelled: 0
		});
	});

	const creditNoteDocs = await getGSTR1CreditNoteDocsReport(req);
	
	return result.concat(creditNoteDocs) || [];
}

async function getGSTR1CreditNoteDocsReport(req) {
	const { org_id, role } = req.user;
	const { from_date, to_date } = req.body;

	const fromDate = parseDate(from_date);
	const toDate = parseDate(to_date);

	// Ensure valid dates
	if (isNaN(fromDate) || isNaN(toDate)) {
		throw new Error('Invalid date range');
	}
	toDate.setHours(23, 59, 59, 999);

	if (!org_id && role !== 'Admin') {
		throw AppError(`You don't authorize to access this api.`);
	}

	const creditNote = await CreditNoteInvoice.findAll({
		where: {
			orgId: org_id,
			createdAt: {
				[Op.between]: [fromDate, toDate],
			},
		},
		attributes: ['id', 'invoicePrefix', 'invoiceNo', 'invoicePostfix'],
		order: [['createdAt', 'ASC']],
	});

	if (!creditNote) {
		return res.status(404).json({ message: 'Credit Note not found' });
	}

	const creditNoteData = creditNote.map((i) => i.get({ plain: true }));

	const groups = {};

	creditNoteData.forEach((inv) => {
		const prefix = inv.invoicePrefix || '';
		const postfix = inv.invoicePostfix || '';
		const key = prefix + '|' + postfix;

		if (!groups[key]) groups[key] = [];

		groups[key].push(inv);
	});

	const result = [];

	Object.keys(groups).forEach((key) => {
		const [prefix, postfix] = key.split('|');

		// sort by numeric invoiceNo
		const sorted = groups[key].sort(
			(a, b) => Number(a.invoiceNo) - Number(b.invoiceNo)
		);

		const startNo = sorted[0].invoiceNo;
		const endNo = sorted[sorted.length - 1].invoiceNo;

		result.push({
			title: 'Credit Note',
			prefix: prefix,
			start: prefix + startNo + (postfix || ''),
			end: prefix + endNo + (postfix || ''),
			totalNumber: sorted.length,
			cancelled: 0
		});
	});

	return result || [];
}