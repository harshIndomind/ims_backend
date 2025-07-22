const { organization } = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { fn, col, Op, JSON } = require('sequelize');

exports.createOrganization = catchAsync(async (req, res) => {
	try {
		const {
			org_name,
			org_code,
			org_email,
			org_person_name,
			org_person_contact,
			org_address,
		} = req.body;

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
			org_email,
			org_person_name,
			org_person_contact,
			org_address,
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
		org_email,
		org_person_name,
		org_person_contact,
		org_address,
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

	const [updatedCount] = await organization.update(
		{
			org_name,
			org_code,
			org_email,
			org_person_name,
			org_person_contact,
			org_address,
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
