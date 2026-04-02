const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const masterMajorHeadService = require('../services/masterMajorHead.service');

exports.createMasterMajorHead = catchAsync(async (req, res) => {
	const data = await masterMajorHeadService.createMasterMajorHead(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Master Major Head created successfully',
		data,
	});
});

exports.updateMasterMajorHead = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterMajorHeadService.updateMasterMajorHead(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Master Major Head updated successfully',
		data,
	});
});

exports.getAllMasterMajorHead = catchAsync(async (req, res) => {
	const data = await masterMajorHeadService.getAllMasterMajorHead(req);

	res.status(StatusCodes.OK).json({ data });
});

exports.getMasterMajorHeadById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterMajorHeadService.getMasterMajorHeadById(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Major Head fetched successfully',
		data,
	});
});

exports.deleteMasterMajorHead = catchAsync(async (req, res) => {
	const { id } = req.params;

	await masterMajorHeadService.deleteMasterMajorHead(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Major Head deleted successfully',
	});
});
