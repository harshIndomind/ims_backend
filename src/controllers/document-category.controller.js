const { docs_category } = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { Op } = require('sequelize');

exports.createDocsCategory = catchAsync(async (req, res) => {
	try {
		const { name, short_code, s3Path } = req.body;

		const isShortCodeExists = await docs_category.findOne({
			where: { short_code },
		});

		if (isShortCodeExists) {
			throw new AppError(
				'Document category already exists with the same short code',
				409
			);
		}

		const DocsCategory = await docs_category.create({
			name,
			short_code,
			s3_folder_Path: s3Path,
		});

		res.status(201).json(DocsCategory);
	} catch (err) {
		throw err;
		res.status(500).json({ error: err.message });
	}
});

exports.updateDocsCategory = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;

		const { name, short_code, s3Path } = req.body;

		const isShortCodeExists = await docs_category.findOne({
			where: { short_code, id: { [Op.ne]: id } },
		});

		if (isShortCodeExists) {
			throw new AppError(
				'Document category already exists with the same short code',
				409
			);
		}

		const [updatedCount] = await docs_category.update(
			{
				name,
				short_code,
				s3_folder_Path: s3Path,
			},
			{
				where: { id },
			}
		);

		if (updatedCount === 0) {
			return res
				.status(404)
				.json({ message: 'Document Category Not Found Or No Changes' });
		}

		res.json({ message: 'Document category updated successfully' });
	} catch (err) {
		throw err;

		res.status(500).json({ error: err.message });
	}
});

exports.getDocsCategory = catchAsync(async (req, res) => {
	const { id } = req.params;
	const DocsCategory = await docs_category.findOne({ where: { id } });
	res.json(DocsCategory);
});

exports.getAllDocsCategories = catchAsync(async (req, res) => {
	try {
		const limit = parseInt(req.query.limit) || 10;
		const offset = parseInt(req.query.offset) || 0;
		const docs_categories = await docs_category.findAndCountAll({
			offset,
			limit,
			order: [['id', 'DESC']],
		});

		res.status(200).json({
			status: true,
			message: 'Document categories fetched successfully',
			data: docs_categories,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

exports.deleteDocsCategory = catchAsync(async (req, res) => {
	const { id } = req.params;

	const [updatedCount] = await docs_category.update(
		{ is_deleted: true },
		{ where: { id } }
	);

	if (updatedCount === 0) {
		return res.status(404).json({
			message: 'Something went wrong while deleting a document category',
		});
	}

	res.json({ message: 'Document categories deleted successfully' });
});
