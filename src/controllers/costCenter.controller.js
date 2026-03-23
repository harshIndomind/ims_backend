const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const costCenterService = require('../services/costCenter.service');

exports.createCostCenter = catchAsync(async (req, res) => {
	const data = await costCenterService.createCostCenter(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Cost Center created successfully',
		data,
	});
});

exports.updateCostCenter = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await costCenterService.updateCostCenter(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Cost Center updated successfully',
		data,
	});
});

exports.getAllCostCenter = catchAsync(async (req, res) => {
	const { limit, offset } = req.query;

	const options = {};
	if(limit){
		options.limit = Number(limit);
		options.offset = Number(offset);
	}

	const data = await costCenterService.getAllCostCenter(options);

	res.status(StatusCodes.OK).json({ data });
});

exports.getCostCenterById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await costCenterService.getCostCenterById(id);

	res.status(StatusCodes.OK).json({
		message: 'Cost Center fetched successfully',
		data,
	});
});

exports.deleteCostCenter = catchAsync(async (req, res) => {
	const { id } = req.params;

	await costCenterService.deleteCostCenter(id);

	res.status(StatusCodes.OK).json({
		message: 'Cost Center deleted successfully',
	});
});
