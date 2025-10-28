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
	GstStateCode
} = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { fn, col, Op, JSON } = require('sequelize');
const bcrypt = require('bcrypt');

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
			email: vendorCompany.email,
			contact_no: vendorCompany.contactNo,
			gstin: vendorCompany.gstin,
			pan: vendorCompany.pan,
			registration_type: vendorCompany.registrationType,
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

		await t.commit();
		res
			.status(201)
			.json({ message: type.name + ' created successfully', partner });
	} catch (error) {
		await t.rollback();
		console.error(error);
		res
			.status(500)
			.json({ message: 'Error creating partner', error: error.message });
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
				attributes: ['id', 'name', 'email', 'roleId'],
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
			vendorCompany,
			billingAddress,
			bankDetails,
			additionalDetails,
			openingBalance,
			name,
			roleId,
			orgId,
		} = req.body;

		const partner = await BusinessPartner.findByPk(id, { transaction: t });
		if (!partner) throw new AppError('Partner not found', 404);

		// Update associated User (exclude email)
		const user = await User.findByPk(partner.user_id, { transaction: t });
		if (user) {
			await user.update(
				{
					name: name || user.name,
					roleId: roleId || user.roleId,
				},
				{ transaction: t }
			);
		}

		// Update main partner details
		await partner.update(
			{
				name: vendorCompany?.name || partner.name,
				code: vendorCompany?.code || partner.code,
				email: vendorCompany?.email || partner.email,
				contact_no: vendorCompany?.contactNo || partner.contact_no,
				gstin: vendorCompany?.gstin || partner.gstin,
				pan: vendorCompany?.pan || partner.pan,
				registration_type:
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

		await t.commit();
		res.status(200).json({ message: 'Partner updated successfully', partner });
	} catch (error) {
		await t.rollback();
		console.error(error);
		res
			.status(500)
			.json({ message: 'Error updating partner', error: error.message });
	}
});

// Delete Partner
exports.deletePartner = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const { id } = req.params;
		const partner = await BusinessPartner.findByPk(id, { transaction: t });
		if (!partner) throw new AppError('Partner not found', 404);

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
			{ model: GstStateCode, as: 'stateData', attributes: ['id', 'state_name'] },
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