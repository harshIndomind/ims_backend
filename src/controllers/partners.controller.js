const {
	BusinessPartner,
	Address,
	BankDetail,
	AdditionalDetail,
	OpeningBalance,
	Role,
	User,
	sequelize,
	Country,
	GstStateCode,
	organization,
	RegistrationType,
	Invoice,
} = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { fn, col, Op } = require('sequelize');
const bcrypt = require('bcrypt');
const uomMap = require('../utils/uomConversionMap');
const { print } = require('../utils/common');
const ExcelJS = require('exceljs');
const { format } = require('date-fns');
const moment = require('moment');
const path = require('node:path');
const logger = require('../utils/logger');
const axios = require('axios');
const {
	SWAYAMM_API_BASE_URL,
	SWAYAMM_LOGIN_ENDPOINT,
	SWAYAMM_USERNAME,
	SWAYAMM_PASSWORD,
	SWAYAMM_GET_ACCOUNT_NAME_ENDPOINT,
	SWAYAMM_CREATE_UPDATE_ACCOUNT_ENDPOINT,
	SWAYAMM_GET_ACCOUNT_BY_CODE_NAME_ENDPOINT,
} = require('../config/serverConfig');

let swayammToken = null;
let swayammTokenExpiry = null;

exports.createPartner = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const {
			orgId,
			roleId,
			name,
			email,
			password,
			vendorCompany,
			billingAddress,
			bankDetails,
			additionalDetails,
			openingBalance,
		} = req.body;

		if (Number(orgId) == 0 || Number(roleId) == 0) {
			throw new AppError('Organization id & Vendor/Company role is required');
		}

		const isSwayammAccountExist = await checkAccountOnSwayamm(
			vendorCompany?.name
		);

		let hasSwayammAccount = false;
		let swayammAccountCode = null;
		if (isSwayammAccountExist?.aCode) {
			hasSwayammAccount = true;
			console.log(
				'isSwayammAccountExist?.aCode ',
				isSwayammAccountExist?.aCode
			);

			swayammAccountCode = isSwayammAccountExist?.aCode;
		} else {
			swayammAccountCode = await getAccountCodeFromSwayamm(vendorCompany?.name);
			console.log('New Account Code Generated ', swayammAccountCode);
			if (!swayammAccountCode) {
				throw new AppError(
					'Something went wrong while fetching vendor/customer account code.'
				);
			}
		}

		if (vendorCompany.account_code !== '' && vendorCompany.code !== '') {
			const businessData = await BusinessPartner.findOne({
				where: {
					[Op.or]: [
						{ code: vendorCompany.code },
						{ account_code: vendorCompany.account_code },
					],
				},
				attributes: ['id'],
			});

			if (businessData) {
				const field =
					businessData.code === vendorCompany.code
						? 'Vendor code'
						: 'Account code';
				throw new AppError(`${field} already exists`);
			}
		}

		const userData = await User.findOne({
			where: { email: email },
		});

		if (userData) {
			throw new AppError('A user with this email already exists.');
		}

		const type = await Role.findOne({ where: { id: roleId }, transaction: t });
		if (!type) throw new AppError('Role not found', 404);

		// Create user first
		const hashedPassword = await bcrypt.hash(password, 10);
		const user = await User.create(
			{ name, email, org_id: orgId, password: hashedPassword, roleId },
			{ transaction: t }
		);

		// Prepare partner data
		const partnerData = {
			user_id: user.id,
			organization_id: orgId,
			type: type.name.replace('-', '_').toLowerCase(),
			name: vendorCompany.name,
			code: vendorCompany.code,
			account_code:
				vendorCompany.account_code !== ''
					? vendorCompany.account_code
					: swayammAccountCode,
			email: vendorCompany.email,
			contact_no: vendorCompany.contactNo,
			gstin: vendorCompany.gstin,
			pan: vendorCompany.pan,
			registration_type: vendorCompany.registrationType,
			registration_type_id: vendorCompany.registrationType,
			addresses: [{ type: 'billing', ...billingAddress }],
		};

		// Only add bankDetails if at least one field is not empty
		if (bankDetails && Object.values(bankDetails).some((v) => v && v !== '')) {
			partnerData.bankDetails = [bankDetails]; // wrap in array if your model expects it
		}

		// Only add additionalDetails if at least one field is meaningful
		if (
			additionalDetails &&
			Object.values(additionalDetails).some((v) => v && v !== 0 && v !== '')
		) {
			partnerData.additionalDetails = [additionalDetails];
		}

		// Only add openingBalances if amount > 0 or type is specified
		const balances = [];
		if (openingBalance?.vendor && openingBalance.vendor.amount > 0) {
			balances.push({
				partner_type: 'vendor',
				balance_type: openingBalance.vendor.balance_type,
				amount: openingBalance.vendor.amount,
			});
		}
		if (openingBalance?.customer && openingBalance.customer.amount > 0) {
			balances.push({
				partner_type: 'customer',
				balance_type: openingBalance.customer.balance_type,
				amount: openingBalance.customer.amount,
			});
		}
		if (balances.length > 0) partnerData.openingBalances = balances;

		// Create partner
		const partner = await BusinessPartner.create(partnerData, {
			include: [
				'addresses',
				'bankDetails',
				'additionalDetails',
				'openingBalances',
			],
			transaction: t,
		});

		if (!hasSwayammAccount) {
			const dataObj = {
				respPerson: name || '',
				account_code: swayammAccountCode
					? swayammAccountCode
					: vendorCompany.account_code,
				company_name: vendorCompany?.name,
				tan: '',
				pan: vendorCompany?.pan,
				gstin: vendorCompany?.gstin,
			};

			await createVendorCustomerAccountOnSwayamm(dataObj);
		}

		await t.commit();
		res
			.status(201)
			.json({ message: type.name + ' created successfully', partner });
	} catch (error) {
		print(error, 'error=> ');
		await t.rollback();
		res.status(500).json({
			message: error.message || 'Error creating partner',
			error: error.message,
		});
	}
});

// Get All Partners
exports.getAllPartners = catchAsync(async (req, res) => {
	const { org_id, role } = req.user;

	const whereClause = {};
	if (role !== 'Super Admin') {
		whereClause.organization_id = org_id;
	}
	const partners = await BusinessPartner.findAll({
		where: whereClause,
		include: [
			// 'addresses',
			// 'bankDetails',
			// 'additionalDetails',
			// 'openingBalances',
			{
				model: User,
				as: 'user',
				attributes: ['id', 'name', 'email', 'roleId', 'is_active'],
			},
			{
				model: organization,
				as: 'organization',
			},
			{
				model: RegistrationType,
				as: 'registrationType',
			},
		],
	});

	console.log('partners ', partners);

	res.status(200).json({ data: partners });
});

// Get Partner by ID
exports.getPartnerById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const partner = await BusinessPartner.findByPk(id, {
		include: [
			{
				association: 'addresses',
				include: [
					{ model: Country, as: 'countryData', attributes: ['id', 'name'] },
					{
						model: GstStateCode,
						as: 'stateData',
						attributes: ['id', 'state_name'],
					},
				],
			},
			'bankDetails',
			'additionalDetails',
			'openingBalances',
			{
				model: User,
				as: 'user',
				attributes: ['id', 'name', 'email', 'roleId'],
			},
			{
				model: RegistrationType,
				as: 'registrationType',
			},
		],
	});

	if (!partner) throw new AppError('Partner not found', 404);

	// Transform the data to match your desired structure
	const response = {
		id: partner.id,
		roleId: partner.user?.roleId || null,
		orgId: partner.organization_id,
		name: partner.user?.name || '',
		email: partner.user?.email || '',
		vendorCompany: {
			name: partner.name,
			code: partner.code,
			contactNo: partner.contact_no,
			address: '', // if you want to include any extra address here
			email: partner.email || '',
			gstin: partner.gstin,
			pan: partner.pan,
			registrationType: partner.registration_type,
			account_code: partner.account_code,
		},
		billingAddress: partner.addresses?.find((a) => a.type === 'billing') || {},
		openingBalance: {
			vendor:
				partner.openingBalances?.find((b) => b.partner_type === 'vendor') || {},
			customer:
				partner.openingBalances?.find((b) => b.partner_type === 'customer') ||
				{},
		},
		bankDetails: partner.bankDetails || {},
		additionalDetails: partner.additionalDetails || {},
		password: '', // Never return the password!
	};

	res.status(200).json({ data: response });
});

// Update Partner
exports.updatePartner = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const { id } = req.params;
		const {
			password,
			vendorCompany,
			billingAddress,
			bankDetails,
			additionalDetails,
			openingBalance,
			name,
			roleId,
			orgId,
		} = req.body;

		const isSwayammAccountExist = await checkAccountOnSwayamm(
			vendorCompany?.name
		);
		
		let hasSwayammAccount = false;
		let swayammAccountCode = null;
		if (isSwayammAccountExist?.aCode) {
			hasSwayammAccount = true;
			swayammAccountCode = isSwayammAccountExist?.aCode;
		} else {
			swayammAccountCode = await getAccountCodeFromSwayamm(vendorCompany?.name);
			if (!swayammAccountCode) {
				throw new AppError(
					'Something went wrong while fetching vendor/customer account code.'
				);
			}
		}

		const partner = await BusinessPartner.findByPk(id, { transaction: t });
		if (!partner) throw new AppError('Partner not found', 404);

		if (vendorCompany.account_code !== '' && vendorCompany.code !== '') {
			const existing = await BusinessPartner.findOne({
				where: {
					id: { [Op.ne]: id }, // exclude current record
					[Op.or]: [
						{ code: vendorCompany.code },
						{ account_code: vendorCompany.account_code },
					],
				},
				transaction: t,
			});

			if (existing) {
				const field =
					existing.code === vendorCompany.code ? 'Vendor code' : 'Account code';
				throw new AppError(`${field} already exists`);
			}
		}

		// Update associated User (exclude email)
		const user = await User.findByPk(partner.user_id, { transaction: t });

		if (user) {
			let updateData = {
				name: name || user.name,
				roleId: roleId || user.roleId,
			};

			if (password) {
				const hashedPassword = await bcrypt.hash(password, 10);
				updateData.password = hashedPassword; // <-- Save hashed password
			}

			await user.update(updateData, { transaction: t });
		}

		// Update main partner details
		await partner.update(
			{
				name: vendorCompany?.name || partner.name,
				code: vendorCompany?.code || partner.code,
				account_code:
					vendorCompany.account_code !== ''
						? vendorCompany.account_code
						: swayammAccountCode,
				email: vendorCompany?.email || partner.email,
				contact_no: vendorCompany?.contactNo || partner.contact_no,
				gstin: vendorCompany?.gstin,
				pan: vendorCompany?.pan || partner.pan,
				registration_type:
					vendorCompany?.registrationType || partner.registration_type,
				registration_type_id:
					vendorCompany?.registrationType || partner.registration_type,
				organization_id: orgId || partner.organization_id,
			},
			{ transaction: t }
		);

		// Update or create billing address
		if (
			billingAddress &&
			Object.values(billingAddress).some((v) => v && v !== '')
		) {
			const [address, created] = await Address.findOrCreate({
				where: { partner_id: id, type: 'billing' },
				defaults: { ...billingAddress, type: 'billing', partner_id: id },
				transaction: t,
			});
			if (!created) await address.update(billingAddress, { transaction: t });
		}

		// Update or create bank details
		if (bankDetails && Object.values(bankDetails).some((v) => v && v !== '')) {
			const [bank, created] = await BankDetail.findOrCreate({
				where: { partner_id: id },
				defaults: { ...bankDetails, partner_id: id },
				transaction: t,
			});
			if (!created) await bank.update(bankDetails, { transaction: t });
		}

		// Update or create additional details
		if (
			additionalDetails &&
			Object.values(additionalDetails).some((v) => v && v !== 0 && v !== '')
		) {
			const [additional, created] = await AdditionalDetail.findOrCreate({
				where: { partner_id: id },
				defaults: { ...additionalDetails, partner_id: id },
				transaction: t,
			});
			if (!created)
				await additional.update(additionalDetails, { transaction: t });
		}

		// Update or create opening balances
		if (openingBalance) {
			for (const type of ['vendor', 'customer']) {
				const data = openingBalance[type];
				if (data && data.amount > 0) {
					const [balance, created] = await OpeningBalance.findOrCreate({
						where: { partner_id: id, partner_type: type },
						defaults: {
							partner_id: id,
							partner_type: type,
							balance_type: data.balance_type,
							amount: data.amount,
						},
						transaction: t,
					});
					if (!created)
						await balance.update(
							{ balance_type: data.balance_type, amount: data.amount },
							{ transaction: t }
						);
				}
			}
		}
		console.log("hasSwayammAccount ", hasSwayammAccount);
		
		if (!hasSwayammAccount) {
			const dataObj = {
				respPerson: name || '',
				account_code: swayammAccountCode
					? swayammAccountCode
					: vendorCompany.account_code,
				company_name: vendorCompany?.name,
				tan: '',
				pan: vendorCompany?.pan,
				gstin: vendorCompany?.gstin,
			};

			await createVendorCustomerAccountOnSwayamm(dataObj);
		}

		await t.commit();
		res.status(200).json({ message: 'Partner updated successfully', partner });
	} catch (error) {
		await t.rollback();
		console.error(error);
		res.status(500).json({
			message: error.message || 'Error updating partner',
			error: error.message,
		});
	}
});

// Delete Partner
exports.deletePartner = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const { id } = req.params;
		const partner = await BusinessPartner.findByPk(id, { transaction: t });
		if (!partner) throw new AppError('Partner not found', 404);

		const invoiceCount = await Invoice.count({
			where: { customerId: partner.id },
		});

		if (invoiceCount > 0) {
			return res.status(400).json({
				message:
					'Cannot delete vendor/customer: Invoices exist for this vendor/customer.',
			});
		}

		// Delete associated records first to avoid foreign key issues
		await User.destroy({ where: { id: partner.user_id }, transaction: t });
		await Address.destroy({ where: { partner_id: id }, transaction: t });
		await BankDetail.destroy({ where: { partner_id: id }, transaction: t });
		await AdditionalDetail.destroy({
			where: { partner_id: id },
			transaction: t,
		});
		await OpeningBalance.destroy({ where: { partner_id: id }, transaction: t });

		await partner.destroy({ transaction: t });
		await t.commit();

		res.status(200).json({ message: 'Partner deleted successfully' });
	} catch (error) {
		await t.rollback();
		console.error(error);
		res
			.status(500)
			.json({ message: 'Error deleting partner', error: error.message });
	}
});

exports.getShippingAddressesByPartnerId = catchAsync(async (req, res) => {
	const { id } = req.params;

	const addresses = await Address.findAll({
		where: { partner_id: id, type: 'shipping' },
		include: [
			{ model: Country, as: 'countryData', attributes: ['id', 'name'] },
			{
				model: GstStateCode,
				as: 'stateData',
				attributes: ['id', 'state_name'],
			},
		],
	});

	res.status(200).json({ data: addresses });
});

exports.addShippingAddress = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	const { id } = req.params;
	try {
		const partner = await BusinessPartner.findByPk(id, { transaction: t });
		if (!partner) throw new AppError('Partner not found', 404);

		const {
			address1,
			address2,
			gstin,
			name,
			contact_person,
			phone,
			email,
			landmark,
			pincode,
			city,
			state_id,
			country_id,
			distance_for_eway_bill_km,
		} = req.body;

		const newAddress = await Address.create(
			{
				partner_id: id,
				type: 'shipping',
				address1,
				address2,
				name,
				gstin,
				contact_person,
				phone,
				email,
				landmark,
				pincode,
				city,
				state_id,
				country_id,
				distance_for_eway_bill_km,
			},
			{ transaction: t }
		);

		await t.commit();
		res
			.status(201)
			.json({ message: 'Shipping address added successfully', newAddress });
	} catch (error) {
		await t.rollback();
		console.error(error);
		res
			.status(500)
			.json({ message: 'Error adding shipping address', error: error.message });
	}
});

exports.updateVendorCanLogin = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const { id } = req.params;
		const { is_active } = req.body;

		const partner = await BusinessPartner.findByPk(id, { transaction: t });
		if (!partner) throw new AppError('Partner not found', 404);

		// Update associated User (exclude email)
		const user = await User.findByPk(partner.user_id, { transaction: t });
		if (user) {
			await user.update(
				{
					is_active,
				},
				{ transaction: t }
			);
		}

		await t.commit();
		res.status(200).json({
			message: `Vendor can login status is now ${
				is_active ? 'enabled.' : 'disabled.'
			}`,
			partner,
		});
	} catch (error) {
		await t.rollback();
		console.error(error);
		res.status(500).json({
			message: 'Error updating vendor can login status',
			error: error.message,
		});
	}
});

exports.getOrganizationVendors = catchAsync(async (req, res) => {
	const { org_id } = req.params;

	const whereClause = {};
	whereClause.organization_id = org_id;

	const partners = await BusinessPartner.findAll({
		where: whereClause,
		// include: [
		// 	{
		// 		model: User,
		// 		as: 'user',
		// 		attributes: ['id', 'name', 'email', 'roleId', 'is_active'],
		// 	},
		// 	{
		// 		model: organization,
		// 		as: 'organization',
		// 	},
		// 	{
		// 		model: RegistrationType,
		// 		as: 'registrationType',
		// 	},
		// ],
	});

	res.status(200).json({ data: partners });
});

exports.exportPartners = catchAsync(async (req, res) => {
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

	const whereClause = {};
	if (role === 'Admin') {
		whereClause['organization_id'] = org_id;
	}

	const partners = await BusinessPartner.findAll({
		where: whereClause,
		// where: {
		// 	createdAt: {
		// 		[Op.between]: [fromDate, toDate],
		// 	},
		// },
		include: [
			{
				model: organization,
				as: 'organization',
			},
			{
				model: Address,
				as: 'addresses',
				include: [
					{ model: Country, as: 'countryData', attributes: ['id', 'name'] },
					{
						model: GstStateCode,
						as: 'stateData',
						attributes: ['id', 'state_name'],
					},
				],
				required: false,
				// where: { type: { [Op.eq]: 'shipping' } },
			},
			'bankDetails',
			'additionalDetails',
			{
				model: OpeningBalance,
				as: 'openingBalances',
				separate: true,
				order: [['id', 'ASC']],
			},
			{
				model: User,
				as: 'user',
				attributes: ['id', 'name', 'email', 'roleId'],
			},
			{
				model: RegistrationType,
				as: 'registrationType',
			},
		],
		order: [['createdAt', 'ASC']],
	});

	let response = partners.map((org) => org.get({ plain: true }));

	const workbook = new ExcelJS.Workbook();
	const templatePath = path.join(
		__dirname,
		'../templates/vendors_customers_blank_template.xlsx'
	);
	const options = {
		dateFormats: ['DD/MM/YYYY'],
	};
	await workbook.xlsx.readFile(templatePath, options);

	const sheet = workbook.getWorksheet('Sheet1');
	let rowStart = 3;

	if (response) {
		response.forEach((inv, index) => {
			const bgColor = index % 2 === 0 ? 'EEEEEE' : 'E6F7FF';

			// sheet.duplicateRow(rowStart, 2, true);

			const row = sheet.getRow(rowStart);

			row.getCell(1).value = index + 1; // SR. NO.
			row.getCell(2).value = inv.type ?? '-'; // Company Type
			row.getCell(3).value = inv.organization.org_name ?? '-'; // Organization Name
			row.getCell(4).value = inv.user.name ?? '' ?? '-'; // Name
			row.getCell(5).value = inv.user.email ?? '-'; // Email
			row.getCell(6).value = inv.registrationType.type ?? '-'; // Registration Type
			row.getCell(7).value = inv.gstin ?? '-'; // GSTIN
			row.getCell(8).value = inv.name ?? '-'; // Company Name
			row.getCell(9).value = inv.code ?? '-'; // Company Code
			row.getCell(10).value = inv.account_code ?? '-'; // Company Account Code
			row.getCell(11).value = inv.contact_no ?? '-'; // Contact No.
			row.getCell(12).value = inv.pan ?? '-'; // PAN No.
			row.getCell(13).value = inv.email ?? '-'; // Email’s

			// Bank Details
			row.getCell(22).value = inv.bankDetails ? inv.bankDetails.bank_name : '-'; // Bank name
			row.getCell(23).value = inv.bankDetails ? inv.bankDetails.ifsc_code : '-'; // ifsc code
			row.getCell(24).value = inv.bankDetails
				? inv.bankDetails.account_no
				: '-'; // accound no
			row.getCell(25).value = inv.bankDetails
				? inv.bankDetails.branch_name
				: '-'; // branch no

			// Additional Details
			row.getCell(26).value = inv.additionalDetails
				? inv.additionalDetails.fax
				: '-'; // fax
			row.getCell(27).value = inv.additionalDetails
				? inv.additionalDetails.website
				: '-'; // Website
			row.getCell(28).value = inv.additionalDetails
				? inv.additionalDetails.credit_limit
				: '-'; // Credit Limit
			row.getCell(29).value = inv.additionalDetails
				? inv.additionalDetails.due_days
				: '-'; // Due Days
			row.getCell(30).value = inv.additionalDetails
				? inv.additionalDetails.note
				: '-'; // Note

			// Opening Details
			row.getCell(31).value = inv.openingBalances?.[0]?.balance_type ?? '-'; // Vendor Balance
			row.getCell(32).value = inv.openingBalances?.[0]?.amount ?? '-'; // Amount
			row.getCell(33).value = inv.openingBalances?.[1]?.balance_type ?? '-'; // Customer Balance
			row.getCell(34).value = inv.openingBalances?.[1]?.amount ?? '-'; // Amount

			colorRow(row, bgColor);
			row.commit();

			// Insert first item in same row
			if (inv.addresses && inv.addresses.length > 0) {
				const first = inv.addresses[0];
				row.getCell(14).value = first.type ?? '-'; // Address Type
				row.getCell(15).value = first.address1 ?? '-'; // Address 1
				row.getCell(16).value = first.address2 ?? '-'; // Address 2
				row.getCell(17).value = first.landmark ?? '-'; // Landmark
				row.getCell(18).value = first.countryData.name ?? '-'; // Country
				row.getCell(19).value = first.stateData.state_name ?? '-'; // State
				row.getCell(20).value = first.city ?? '-'; // City
				row.getCell(21).value = first.pincode ?? '-'; // Pincode

				row.commit();
			}

			if (inv.addresses && inv.addresses.length > 0) {
				// For all remaining items, add NEW rows but leave invoice columns empty
				for (let i = 1; i < inv.addresses.length; i++) {
					const item = inv.addresses[i];
					rowStart++; // move to next row
					const itemRow = sheet.getRow(rowStart);

					itemRow.getCell(14).value = item.type ?? '-'; // Address Type
					itemRow.getCell(15).value = item.address1 ?? '-'; // Address 1
					itemRow.getCell(16).value = item.address2 ?? '-'; // Address 2
					itemRow.getCell(17).value = item.landmark ?? '-'; // Landmark
					itemRow.getCell(18).value = item.countryData.name ?? '-'; // Country
					itemRow.getCell(19).value = item.stateData.state_name ?? '-'; // State
					itemRow.getCell(20).value = item.city ?? '-'; // City
					itemRow.getCell(21).value = item.pincode ?? '-'; // Pincode

					itemRow.commit();
					colorRow(itemRow, bgColor);
				}
			}
			rowStart++;
		});

		sheet.columns.forEach((column) => {
			let maxLength = 0;

			column.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
				if (rowNumber !== 1 && rowNumber !== 2) {
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
				}
			});
			column.width = Math.min(maxLength + 2, 25);
		});

		sheet.eachRow((row, rowNumber) => {
			if (rowNumber !== 1 && rowNumber !== 2) {
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

	const fileName = formatted + '_exported_vendors_and_customers.xlsx';

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

	for (let col = 1; col <= 34; col++) {
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

async function getValidToken() {
	// 1. No token exists → login
	if (!swayammToken) {
		return await loginOnSwayamm();
	}

	// 2. Token expired → login again
	if (swayammTokenExpiry && Date.now() >= swayammTokenExpiry) {
		return await loginOnSwayamm();
	}
	console.log('swayammToken ', swayammToken);

	// 3. Otherwise return cached token
	return swayammToken;
}

async function loginOnSwayamm() {
	const LOGIN_API = `${SWAYAMM_API_BASE_URL}${SWAYAMM_LOGIN_ENDPOINT}`;

	try {
		const { data } = await axios.post(LOGIN_API, {
			username: SWAYAMM_USERNAME,
			password: SWAYAMM_PASSWORD,
		});

		swayammToken = data.accessToken;
		swayammTokenExpiry = Date.now() + data.expires * 1000;

		return swayammToken;
	} catch (err) {
		logger.error('Login failed:', { err });
		throw new AppError('Unable to login to Swayamm.');
	}
}

async function checkAccountOnSwayamm(companyName = null) {
	const token = await getValidToken();

	if (!token) {
		throw new AppError('Something went wrong while logging into Swayamm.');
	}
	console.log('Swayamm Token ', token);

	try {
		const GET_ACCOUNT_BY_CODE_AND_NAME_API = `${SWAYAMM_API_BASE_URL}${SWAYAMM_GET_ACCOUNT_BY_CODE_NAME_ENDPOINT}`;
		console.log(
			'GET_ACCOUNT_BY_CODE_AND_NAME_API:',
			GET_ACCOUNT_BY_CODE_AND_NAME_API
		);

		const { data } = await axios.get(GET_ACCOUNT_BY_CODE_AND_NAME_API, {
			params: {
				// code: '',
				name: companyName,
			},
			headers: {
				Authorization: `Bearer ${token.trim()}`,
			},
		});
		console.log('Account Exists ', data);

		return data || null;
	} catch (error) {
		logger.error('Failed to fetch existing account details from Swayamm: ', { error });
		return null;
	}
}

async function getAccountCodeFromSwayamm(companyName = null, ledgerCode = 'L') {
	const token = await getValidToken();

	if (!token) {
		throw new AppError('Something went wrong while logging into Swayamm.');
	}
	console.log('Swayamm Token ', token);

	try {
		const GET_ACCOUNT_NAME_API = `${SWAYAMM_API_BASE_URL}${SWAYAMM_GET_ACCOUNT_NAME_ENDPOINT}`;
		console.log('GET_ACCOUNT_NAME_API:', GET_ACCOUNT_NAME_API);

		const { data } = await axios.get(GET_ACCOUNT_NAME_API, {
			params: {
				lCode: ledgerCode,
				aDesc: companyName,
			},
			headers: {
				Authorization: `Bearer ${token.trim()}`,
			},
		});
		console.log('data ', data);

		return data || null;
	} catch (error) {
		logger.error('Error fetching account name: ', { error });
		throw new AppError('Failed to fetch account name from Swayamm.');
	}
}

async function createVendorCustomerAccountOnSwayamm(userObj) {
	const token = await getValidToken();

	if (!token) {
		throw new AppError(
			'Something went wrong while creating an account on Swayamm.'
		);
	}

	try {
		const CREATE_UPDATE_ACCOUNT_API = `${SWAYAMM_API_BASE_URL}${SWAYAMM_CREATE_UPDATE_ACCOUNT_ENDPOINT}`;

		const accountDetails = prepareVendorCustomerData(userObj);
		console.log("accountDetails ", accountDetails);
		
		console.log("CREATE_UPDATE_ACCOUNT_API ", CREATE_UPDATE_ACCOUNT_API);
		
		const { data } = await axios.post(
			CREATE_UPDATE_ACCOUNT_API,
			accountDetails,
			{
				headers: {
					Authorization: `Bearer ${token.trim()}`,
					'Content-Type': 'application/json',
				},
			}
		);
		console.log("createVendorCustomerAccountOnSwayamm ", createVendorCustomerAccountOnSwayamm);
		
		return data || null;
	} catch (error) {
		console.log('RAW error response:', error);

		console.log('error ', Object.keys(error.response.data));
		console.log('error ', error.response.data);

		logger.error('Error creating account: ', { error });
		throw new AppError('Failed to create account on Swayamm.');
	}
}

function prepareVendorCustomerData(data = null) {
	const date = new Date();
	const todayDate = `${date.getFullYear()}-${String(
		date.getMonth() + 1
	).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

	const preparedData = {
		id: 0,
		aCode: data.account_code,
		aName: data.company_name,
		aLedger: 'L',
		aLedgerDesc: 'NE',
		univCode: data.account_code,
		doOpening: todayDate,
		respPerson: '',
		openingBaldr: 0,
		openingBalcr: 0,
		printAdvice: true,
		acFinal: true,
		lastTrDate: null,
		debitPnLCode: 'NE',
		debitPnLDesc: 'NO ENTRY',
		debitBShCode: 'NE',
		debitBShDesc: 'NO ENTRY',
		creditPnLCode: 'NE',
		creditPnLDesc: 'NO ENTRY',
		creditBShCode: 'NE',
		creditBShDesc: 'NO ENTRY',
		casFlowInflowCode: 'NE',
		casFlowInflowDesc: 'NO ENTRY',
		casFlowOutflowCode: 'NE',
		casFlowOutflowDesc: 'NO ENTRY',
		debitCostCenterCode: 'NE',
		debitCostCenterDesc: 'NO ENTRY',
		creditCostCenterCode: 'NE',
		creditCostCenterDesc: 'NO ENTRY',
		misDbCode: 'NE',
		misDbDesc: 'NO ENTRY',
		misCrCode: 'NE',
		misCrDesc: 'NO ENTRY',
		openingBal: 0,
		tan: data.tan || '',
		pan: data.pan || '',
		gst: data.gstin || '',
		isEditable: true,
		isReviewed: false,
	};

	return preparedData;
}
