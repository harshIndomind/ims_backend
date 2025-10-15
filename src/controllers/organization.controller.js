const { organization, User } = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { fn, col, Op, JSON } = require('sequelize');
const bcrypt = require('bcrypt');

exports.createOrganization = catchAsync(async (req, res) => {
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
			update_gst_on_invoices
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

		
		const Organization = await organization.create({
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
			update_gst_on_invoices,
			createdBy: loggedInUserId,
		});
		
		const hashedPassword = await bcrypt.hash('12345678', 10);
		const user = await User.create({
			org_id: Organization.id,
			name: org_person_name,
			email: org_email,
			password: hashedPassword,
			roleId: 2, // Admin Role
			is_active: 1
		});

		res.status(201).json(Organization);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

exports.updateOrganization = catchAsync(async (req, res) => {
	// try {
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
		state,
		update_gst_on_invoices
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

	const hashedPassword = await bcrypt.hash('12345678', 10);

	const isUserExists = await User.findOne({ where: { email: org_email } });

	if (!isUserExists) {
		throw new AppError('User not exists.', 404);
	}

	await User.update(
		{
			name: org_person_name,
			email: org_email,
		},
		{ where: { id: isUserExists.id } }
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
			state,
			update_gst_on_invoices
		},
		{
			where: { id },
		}
	);

	if (updatedCount === 0) {
		return res
			.status(404)
			.json({ message: 'Organization not found or no changes' });
	}

	res.json({ message: 'Organization updated successfully' });
	// } catch (err) {
	// 	res.status(500).json({ error: err.message });
	// }
});

exports.getOrganization = catchAsync(async (req, res) => {
	const { id } = req.params;
	const Organization = await organization.findOne({ where: { id } });
	res.json(Organization);
});

exports.getAllOrganizations = catchAsync(async (req, res) => {
	try {
		const limit = parseInt(req.query.limit) || 10;
		const offset = parseInt(req.query.offset) || 0;
		const organizations = await organization.findAndCountAll({
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
	const { id } = req.params;

	await organization.destroy({ where: { id } });
	res.json({ message: 'Organization deleted successfully' });
});
