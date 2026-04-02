const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const masterSubHeadAmountService = require('../services/subHeadAmount.service');

exports.createSubHeadAmount = catchAsync(async (req, res) => {
	const data = await masterSubHeadAmountService.createSubHeadAmount(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Sub head amount created successfully',
		data,
	});
});

exports.updateSubHeadAmount = catchAsync(async (req, res) => {
	

	const data = await masterSubHeadAmountService.updateSubHeadAmount(req, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Sub head amount updated successfully',
		data,
	});
});

exports.getAllSubHeadAmount = catchAsync(async (req, res) => {
	const data = await masterSubHeadAmountService.getAllSubHeadAmount(req);

	res.status(StatusCodes.OK).json({ data });
});

exports.getSubHeadAmountById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterSubHeadAmountService.getSubHeadAmountById(id);

	res.status(StatusCodes.OK).json({
		message: 'Sub head amount fetched successfully',
		data,
	});
});

exports.deleteSubHeadAmount = catchAsync(async (req, res) => {
	const { id } = req.params;

	await masterSubHeadAmountService.deleteSubHeadAmount(id);

	res.status(StatusCodes.OK).json({
		message: 'Sub head amount deleted successfully',
	});
});

// exports.getSubAmountByMajorHeadAndPeriod = catchAsync(async (req, res) => {
// 	const { major_head_id, period_id } = req.params;

// 	await masterSubHeadAmountService.getSubAmountByMajorHeadAndPeriod(major_head_id, period_id);

// 	res.status(StatusCodes.OK).json({
// 		message: 'Sub head amount deleted successfully',
// 	});
// });

exports.getAmountByMajorHeadAndPeriod = catchAsync(async (req, res) => {
	const { id, major_head_id, period_id } = req.params;
	console.log("{ major_head_id, period_id }", { id, major_head_id, period_id });
	
	const data = await masterSubHeadAmountService.getAmountByMajorHeadAndPeriod(id, major_head_id, period_id);

	res.status(StatusCodes.OK).json({
		message: 'Sub head amount with major head amount fetched successfully',
		data,
	});
});