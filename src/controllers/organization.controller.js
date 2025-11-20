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
