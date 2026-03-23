const { Company } = require('../models/index');
const catchAsync = require('../utils/catchAsync');

exports.createCompany = catchAsync(async (req, res) => {
	try {
		const { name, description, address, contact_no, alt_contact_no } = req.body;

		const company = await Company.create({
			name,
			description,
			address,
			contact_no,
			alt_contact_no,
		});

		res.status(201).json(company);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

exports.updateCompany = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;

		const { name, description, address, contact_no, alt_contact_no } = req.body;

		const [updatedCount] = await Company.update(
			{
				name,
				description,
				address,
				contact_no,
				alt_contact_no,
			},
			{
				where: { id },
			}
		);

		if (updatedCount === 0) {
			return res
				.status(404)
				.json({ message: 'Company not found or no changes' });
		}

		res.json({ message: 'Company updated successfully' });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

exports.getCompany = catchAsync(async (req, res) => {
	const { id } = req.params;
	const company = await Company.findOne({ where: { id } });
	res.json(company);
});

exports.getAllCompanies = catchAsync(async (req, res) => {
	try {
		const companies = await Company.findAll();

		res.status(200).json(companies);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

exports.deleteCompany = catchAsync(async (req, res) => {
	const { id } = req.params;

	await Company.destroy({ where: { id } });
	res.json({ message: 'Company deleted successfully' });
});
