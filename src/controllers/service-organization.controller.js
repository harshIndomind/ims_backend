const {
	organization,
	User,
	OrganizationBankDetails,
	sequelize,
	GstStateCode,
	Invoice,
	BusinessPartner,
	UserApp,
	App,
} = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const ExcelJS = require('exceljs');
const path = require('node:path');
const organizationService = require('../services/organization.service');
const { StatusCodes } = require('http-status-codes');

exports.createOrganization = catchAsync(async (req, res) => {
	const Organization = organizationService.createOrganization(req);

	res.status(StatusCodes.CREATED).json(Organization);
});

exports.updateOrganization = catchAsync(async (req, res) => {
	const Organization = organizationService.updateOrganization(req);

	res.status(StatusCodes.OK).json(Organization);
});

exports.getOrganization = catchAsync(async (req, res) => {
	const organization = organizationService.getOrganization(req);
	res.status(StatusCodes.OK).json(organization);
});

exports.getAllOrganizations = catchAsync(async (req, res) => {
	const organizations = organizationService.getAllOrganizations(req);
	res.status(StatusCodes.OK).json({
		status: true,
		message: 'Organizations fetched successfully',
		data: organizations,
	});
});

exports.deleteOrganization = catchAsync(async (req, res) => {
	const organizations = organizationService.deleteOrganization(req);
	return res.json({ message: 'Organization deleted successfully' });
});

exports.getOrganizationBankDetails = catchAsync(async (req, res) => {
	const { org_id } = req.user;
	const bankDetails = await OrganizationBankDetails.findAll({
		where: { org_id: org_id },
	});
	res.json(bankDetails);
});

exports.exportOrganizations = catchAsync(async (req, res) => {
	const { org_id, role } = req.user;
	// const { from_date, to_date } = req.query;
	// const fromDate = new Date(from_date);
	// const toDate = new Date(to_date);

	// // Validate that both dates are valid
	// if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
	// 	throw new Error('Invalid date range');
	// }

	// // Adjust the end date to include the full day (23:59:59)
	// toDate.setHours(23, 59, 59, 999);
	// if (!org_id && role !== 'Admin') {
	// 	throw AppError(`You don't authorize to access this api.`);
	// }

	const organizations = await organization.findAll({
		// where: {
		// 	createdAt: {
		// 		[Op.between]: [fromDate, toDate],
		// 	},
		// },
		include: [
			{
				model: GstStateCode,
				as: '_state',
				attributes: ['state_name', 'gst_code'],
			},
			{ model: OrganizationBankDetails, as: 'bankDetails' },
		],
		order: [['createdAt', 'ASC']],
	});

	let response = organizations.map((org) => org.get({ plain: true }));

	const workbook = new ExcelJS.Workbook();
	const templatePath = path.join(
		__dirname,
		'../templates/organization_blank_template.xlsx',
	);
	const options = {
		dateFormats: ['DD/MM/YYYY'],
	};
	await workbook.xlsx.readFile(templatePath, options);

	const sheet = workbook.getWorksheet('Sheet1');
	let rowStart = 2;

	if (response) {
		response.forEach((inv, index) => {
			const bgColor = index % 2 === 0 ? 'FFE6F7' : 'E6F7FF';

			// sheet.duplicateRow(rowStart, 2, true);

			const row = sheet.getRow(rowStart);

			row.getCell(1).value = index + 1; // SR. NO.
			row.getCell(2).value = inv.org_name; // Organization Name
			row.getCell(3).value = inv.org_code; // Organization Code
			row.getCell(4).value = inv.org_gst_number ?? ''; // GSTIN
			row.getCell(5).value = inv.pan; // PAN
			row.getCell(6).value = inv.org_person_name; // Contact Person Name
			row.getCell(7).value = inv.org_person_contact; // Contact Person No.
			row.getCell(8).value = inv.org_email; // Contact Person Email
			row.getCell(9).value = inv.pincode; // Pincode
			row.getCell(10).value = inv._state.state_name; // State
			row.getCell(11).value = inv.city; // City
			row.getCell(12).value = inv.org_address; // Address

			colorRow(row, bgColor);
			row.commit();

			// Insert first item in same row
			if (inv.bankDetails && inv.bankDetails.length > 0) {
				const first = inv.bankDetails[0];
				row.getCell(13).value = first.account_name ?? '-'; // Account Holder Name
				row.getCell(14).value = first.account_no ?? '-'; // Account Number
				row.getCell(15).value = first.bank_name ?? '-'; // Bank Name
				row.getCell(16).value = first.branch_name ?? '-'; // Branch Name
				row.getCell(17).value = first.bank_ifsc ?? '-'; // IFSC Code
				row.getCell(18).value = first.swift_code ?? '-'; // Swift Code
				row.getCell(19).value = first.micr_code ?? '-'; // MICR Code
				row.getCell(20).value = first.upi_id ?? '-'; // UPI ID

				row.commit();
			}

			// For all remaining items, add NEW rows but leave invoice columns empty
			for (let i = 1; i < inv.bankDetails.length; i++) {
				const item = inv.bankDetails[i];
				rowStart++; // move to next row
				const itemRow = sheet.getRow(rowStart);

				itemRow.getCell(13).value = item.account_name ?? '-'; // Account Holder Name
				itemRow.getCell(14).value = item.account_no ?? '-'; // Account Number
				itemRow.getCell(15).value = item.bank_name ?? '-'; // Bank Name
				itemRow.getCell(16).value = item.branch_name ?? '-'; // Branch Name
				itemRow.getCell(17).value = item.bank_ifsc ?? '-'; // IFSC Code
				itemRow.getCell(18).value = item.swift_code ?? '-'; // Swift Code
				itemRow.getCell(19).value = item.micr_code ?? '-'; // MICR Code
				itemRow.getCell(20).value = item.upi_id ?? '-'; // UPI ID

				itemRow.commit();
				colorRow(itemRow, bgColor);
			}
			rowStart++;
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

		sheet.eachRow((row, rowNumber) => {
			if (rowNumber !== 1) {
				row.eachCell((cell) => {
					// Font
					cell.font = { name: 'Arial', size: 10 };

					// Border
					cell.border = {
						top: { style: 'dotted' },
						left: { style: 'dotted' },
						bottom: { style: 'dotted' },
						right: { style: 'dotted' },
					};
				});
			}
		});

		// const last = sheet.lastRow.number;
		// sheet.spliceRows(last - 1, 2);

		// sheet._rows = sheet._rows.filter(
		// 	(r) => r && r.values && r.values.length > 0
		// );
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

	const fileName = formatted + '_exported_organizations.xlsx';

	res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
	res.setHeader(
		'Content-Type',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	);

	await workbook.xlsx.write(res);

	res.end();
});

function colorRow(row, bgColor) {
	console.log(`Coloring row no ${row} with color ${bgColor}`);

	for (let col = 1; col <= 20; col++) {
		const cell = row.getCell(col);

		// Clear template fill first (IMPORTANT)
		cell.fill = null;

		// Now apply new fill
		cell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: bgColor },
		};
	}
}
