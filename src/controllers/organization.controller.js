const {
	organization,
	User,
	OrganizationBankDetails,
	sequelize,
	GstStateCode,
	Invoice,
	BusinessPartner,
} = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { fn, col, Op, JSON } = require('sequelize');
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');
const { format } = require('date-fns');
const moment = require('moment');
const path = require('node:path');

exports.createOrganization = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const loggedInUserId = req.user.id;

		const {
			org_name,
			org_code,
			org_gst_number,
			pan,
			org_email,
			org_person_name,
			org_person_contact,
			org_address,
			pincode,
			city,
			state,
			state_id,
			update_gst_on_invoices,
			bankDetails,
		} = req.body;
		console.log('req.body ', req.body);

		const isOrgCodeExists = await organization.findOne({
			where: { org_code },
		});

		if (isOrgCodeExists) {
			throw new AppError(
				'Organization already exists with the same organization code',
				409
			);
		}

		const Organization = await organization.create(
			{
				org_name,
				org_code,
				org_gst_number,
				pan,
				org_email,
				org_person_name,
				org_person_contact,
				org_address,
				pincode,
				city,
				// state,
				state_id,
				update_gst_on_invoices,
				createdBy: loggedInUserId,
			},
			{ transaction: t }
		);

		if (bankDetails && bankDetails.length > 0) {
			console.log('bankDetails ', bankDetails);

			for (const detail of bankDetails) {
				delete detail.id;
				await OrganizationBankDetails.create(
					{ ...detail, org_id: Organization.id },
					{ transaction: t }
				);
			}
		}

		const hashedPassword = await bcrypt.hash('12345678', 10);
		const user = await User.create(
			{
				org_id: Organization.id,
				name: org_person_name,
				email: org_email,
				password: hashedPassword,
				roleId: 2, // Admin Role
				is_active: 1,
			},
			{ transaction: t }
		);

		t.commit();
		res.status(201).json(Organization);
	} catch (err) {
		t.rollback();
		res.status(500).json({ error: err.message });
	}
});

exports.updateOrganization = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const { id } = req.params;

		const {
			org_name,
			org_code,
			org_gst_number,
			pan,
			org_email,
			org_person_name,
			org_person_contact,
			org_address,
			pincode,
			city,
			// state,
			state_id,
			update_gst_on_invoices,
			bankDetails,
		} = req.body;

		const isOrgCodeExists = await organization.findOne({
			where: { org_code, id: { [Op.ne]: id } },
		});

		if (isOrgCodeExists) {
			throw new AppError(
				'Organization already exists with the same organization code',
				409
			);
		}

		// const hashedPassword = await bcrypt.hash('12345678', 10);

		const isUserExists = await User.findOne({ where: { email: org_email } });

		if (!isUserExists) {
			throw new AppError('User not exists.', 404);
		}

		await User.update(
			{
				name: org_person_name,
				email: org_email,
			},
			{ where: { id: isUserExists.id }, transaction: t }
		);

		const [updatedCount] = await organization.update(
			{
				org_name,
				org_code,
				org_gst_number,
				pan,
				org_email,
				org_person_name,
				org_person_contact,
				org_address,
				pincode,
				city,
				// state,
				state_id,
				update_gst_on_invoices,
			},
			{
				where: { id },
				transaction: t,
			}
		);

		if (bankDetails && bankDetails.length > 0) {
			const existingIds = bankDetails
				.filter((d) => Number(d.id))
				.map((d) => d.id);

			// 🔹 Delete records that are no longer in the new list
			await OrganizationBankDetails.destroy({
				where: {
					org_id: id,
					...(existingIds.length > 0 && { id: { [Op.notIn]: existingIds } }),
				},
				transaction: t,
			});

			for (const detail of bankDetails) {
				if (Number(detail.id)) {
					// 🔹 Update existing bank record
					await OrganizationBankDetails.update(detail, {
						where: { id: detail.id, org_id: id },
						transaction: t,
					});
				} else {
					delete detail.id;
					// 🔹 Create new bank record
					await OrganizationBankDetails.create(
						{ ...detail, org_id: id },
						{ transaction: t }
					);
				}
			}
		}

		t.commit();

		if (updatedCount === 0) {
			return res
				.status(404)
				.json({ message: 'Organization not found or no changes' });
		}

		res.json({ message: 'Organization updated successfully' });
	} catch (err) {
		res.status(500).json({ error: err.message });
		t.rollback();
	}
});

exports.getOrganization = catchAsync(async (req, res) => {
	const { id } = req.params;
	const Organization = await organization.findOne({
		where: { id },
		include: [{ model: OrganizationBankDetails, as: 'bankDetails' }],
	});
	res.json(Organization);
});

exports.getAllOrganizations = catchAsync(async (req, res) => {
	try {
		const limit = parseInt(req.query.limit) || 10;
		const offset = parseInt(req.query.offset) || 0;
		const organizations = await organization.findAndCountAll({
			include: {
				model: GstStateCode,
				as: '_state',
				attributes: ['state_name', 'gst_code'],
			},
			offset,
			limit,
			order: [['id', 'DESC']],
		});

		res.status(200).json({
			status: true,
			message: 'Organizations fetched successfully',
			data: organizations,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

exports.deleteOrganization = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;

		const Organization = await organization.findByPk(id);

		if (!Organization) {
			return res.status(404).json({ message: 'Organization not found' });
		}

		const businessPartnerCount = await BusinessPartner.count({
			where: { organization_id: Organization.id },
		});

		if (businessPartnerCount > 0) {
			return res.status(400).json({
				message:
					'Cannot delete organization: Vendors/Customers exist for this organization.',
			});
		}

		const invoiceCount = await Invoice.count({
			where: { orgId: Organization.id },
		});

		if (invoiceCount > 0) {
			return res.status(400).json({
				message:
					'Cannot delete organization: Invoices exist for this organization.',
			});
		}

		const t = await sequelize.transaction();

		try {
			const user = await User.findOne({
				where: { org_id: Organization.id, roleId: 2 },
				transaction: t,
			});

			if (user) {
				await user.destroy({ transaction: t });
			}

			await Organization.destroy({ transaction: t });

			await t.commit();

			return res.json({ message: 'Organization deleted successfully' });
		} catch (err) {
			await t.rollback();
			throw err;
		}
	} catch (error) {
		console.error(error);
		return res.status(500).json({
			message: 'Failed to delete organization',
			error: error.message,
		});
	}
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
		'../templates/organization_blank_template.xlsx'
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
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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
