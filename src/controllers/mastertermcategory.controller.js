const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const masterTermCategoryService = require('../services/masterTermCategory.service');

exports.createTermCategory = catchAsync(async (req, res) => {
	const data = await masterTermCategoryService.createTermCategory(req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Term Category created successfully',
		data,
	});
});

exports.updateTermCategory = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterTermCategoryService.updateTermCategory(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Term Category updated successfully',
		data,
	});
});

exports.getAllTermCategories = catchAsync(async (req, res) => {
	const data = await masterTermCategoryService.getAllTermCategories(req);

	res.status(StatusCodes.OK).json({ data });
});

exports.getTermCategoryById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterTermCategoryService.getTermCategoryById(id);

	res.status(StatusCodes.OK).json({
		message: 'Term Category fetched successfully',
		data,
	});
});

exports.deleteTermCategory = catchAsync(async (req, res) => {
	const { id } = req.params;

	await masterTermCategoryService.deleteTermCategory(id);

	res.status(StatusCodes.OK).json({
		message: 'Term Category deleted successfully',
	});
});


exports.toggleTermCategoryStatus = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterTermCategoryService.toggleTermCategoryStatus(id);

	res.status(StatusCodes.OK).json({
		message: 'Term Category status updated successfully',
		data,
	});
});

// Extra: get only active categories for dropdown
exports.getActiveTermCategories = catchAsync(async (req, res) => {
	const data = await masterTermCategoryService.getActiveTermCategories();

	res.status(StatusCodes.OK).json({
		message: 'Active Term Categories fetched successfully',
		data,
	});
});