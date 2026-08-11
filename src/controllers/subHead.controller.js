const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const masterSubHeadService = require('../services/masterSubHead.service');

exports.createMasterSubHead = catchAsync(async (req, res) => {
	const data = await masterSubHeadService.createMasterSubHead(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Master Sub Head created successfully',
		data,
	});
});

exports.updateMasterSubHead = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterSubHeadService.updateMasterSubHead(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Master Sub Head updated successfully',
		data,
	});
});

exports.getAllMasterSubHead = catchAsync(async (req, res) => {
	const data = await masterSubHeadService.getAllMasterSubHead(req);

	res.status(StatusCodes.OK).json({ data });
});

exports.getMasterSubHeadById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterSubHeadService.getMasterSubHeadById(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Sub Head fetched successfully',
		data,
	});
});

exports.deleteMasterSubHead = catchAsync(async (req, res) => {
	const { id } = req.params;

	await masterSubHeadService.deleteMasterSubHead(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Sub Head deleted successfully',
	});
});

