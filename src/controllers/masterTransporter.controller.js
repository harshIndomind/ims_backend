const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const masterTransporter = require('../services/masterTransporter.service');

exports.createMasterTransporter = catchAsync(async (req, res) => {
	const data = await masterTransporter.createMasterTransporter(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Master Transporter Created Successfully',
		data,
	});
});

exports.updateMasterTransporter = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterTransporter.updateMasterTransporter(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Master Transporter Updated Successfully',
		data,
	});
});

exports.getAllMasterTransporter = catchAsync(async (req, res) => {
	const data = await masterTransporter.getAllMasterTransporter(req);

	res.status(StatusCodes.OK).json({ data });
});

exports.getMasterTransporterById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterTransporter.getMasterTransporterById(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Transporter Fetched Successfully',
		data,
	});
});

exports.deleteMasterTransporter = catchAsync(async (req, res) => {
	const { id } = req.params;

	await masterTransporter.deleteMasterTransporter(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Transporter Deleted Successfully',
	});
});
