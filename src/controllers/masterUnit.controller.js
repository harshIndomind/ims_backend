const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const masterUnit = require('../services/masterUnit.service');

exports.createMasterUnit = catchAsync(async (req, res) => {
	const data = await masterUnit.createMasterUnit(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Master Unit Created Successfully',
		data,
	});
});

exports.updateMasterUnit = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterUnit.updateMasterUnit(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Master Unit Updated Successfully',
		data,
	});
});

exports.getAllMasterUnit = catchAsync(async (req, res) => {
	const data = await masterUnit.getAllMasterUnit(req);

	res.status(StatusCodes.OK).json({ data });
});

exports.getMasterUnitById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterUnit.getMasterUnitById(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Unit Fetched Successfully',
		data,
	});
});

exports.deleteMasterUnit = catchAsync(async (req, res) => {
	const { id } = req.params;

	await masterUnit.deleteMasterUnit(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Unit Deleted Successfully',
	});
});
