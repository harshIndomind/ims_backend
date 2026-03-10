const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const masterMajorHeadAmountService = require('../services/masterMajorHeadAmount.service');

exports.createMasterMajorHeadAmount = catchAsync(async (req, res) => {
	const data = await masterMajorHeadAmountService.createMasterMajorHeadAmount(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Master Major Head Amount created successfully',
		data,
	});
});

exports.updateMasterMajorHeadAmount = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterMajorHeadAmountService.updateMasterMajorHeadAmount(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Master Major Head Amount updated successfully',
		data,
	});
});

exports.getAllMasterMajorHeadAmount = catchAsync(async (req, res) => {
	const { limit, offset } = req.query;

	const options = {};
	if(limit){
		options.limit = Number(limit);
		options.offset = Number(offset);
	}

	const data = await masterMajorHeadAmountService.getAllMasterMajorHeadAmount(options);

	res.status(StatusCodes.OK).json({ data });
});

exports.getMasterMajorHeadAmountById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterMajorHeadAmountService.getMasterMajorHeadAmountById(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Major Head fetched successfully',
		data,
	});
});

exports.deleteMasterMajorHeadAmount = catchAsync(async (req, res) => {
	const { id } = req.params;

	await masterMajorHeadAmountService.deleteMasterMajorHeadAmount(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Major Head deleted successfully',
	});
});

exports.getAmountByMajorHeadAndPeriod = catchAsync(async (req, res) => {
	const { major_head_id, period_id } = req.params;
	console.log("{ major_head_id, period_id }", { major_head_id, period_id });
	
	const data = await masterMajorHeadAmountService.getAmountByMajorHeadAndPeriod(major_head_id, period_id);

	res.status(StatusCodes.OK).json({
		message: 'Master major head amount fetched successfully',
		data,
	});
});
