const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const masterPeriodService = require('../services/masterPeriod.service');

exports.createMasterPeriod = catchAsync(async (req, res) => {
	const data = await masterPeriodService.createMasterPeriod(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Master Period created successfully',
		data,
	});
});

exports.updateMasterPeriod = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterPeriodService.updateMasterPeriod(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Master Period updated successfully',
		data,
	});
});

exports.getAllMasterPeriod = catchAsync(async (req, res) => {
	const { limit, offset } = req.query;

	const options = {};
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset);
	}
	const data = await masterPeriodService.getAllMasterPeriod(options);
	console.log("data ", data);
	
	res.status(StatusCodes.OK).json({ data });
});

exports.getMasterPeriodById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterPeriodService.getMasterPeriodById(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Period fetched successfully',
		data,
	});
});

exports.getMasterPeriodByMajorHead = catchAsync(async (req, res) => {
	const { major_head_id } = req.params;

	const data = await masterPeriodService.getMasterPeriodByMajorHead(major_head_id);

	res.status(StatusCodes.OK).json({
		message: 'Master Period fetched successfully',
		data,
	});
});

exports.deleteMasterPeriod = catchAsync(async (req, res) => {
	const { id } = req.params;

	await masterPeriodService.deleteMasterPeriod(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Period deleted successfully',
	});
});

exports.latestSubCode = catchAsync(async (req, res) => {
	const subCode = await masterPeriodService.latestSubCode();

	res.status(StatusCodes.OK).json({
		subCode,
	});
});
