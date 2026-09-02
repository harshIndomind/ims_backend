const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const service = require('../services/masterSubHeadCostCenterAmount.service');

exports.createSubHeadCostCenterAmount = catchAsync(async (req, res) => {
	const data = await service.createSubHeadCostCenterAmount(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Sub head cost center amount created successfully',
		data,
	});
});

exports.updateSubHeadCostCenterAmount = catchAsync(async (req, res) => {
	const data = await service.updateSubHeadCostCenterAmount(req, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Sub head cost center amount updated successfully',
		data,
	});
});

exports.getAllSubHeadCostCenterAmount = catchAsync(async (req, res) => {
	const data = await service.getAllSubHeadCostCenterAmount(req);

	res.status(StatusCodes.OK).json({ data });
});

exports.getSubHeadCostCenterAmountById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await service.getSubHeadCostCenterAmountById(req, id);

	res.status(StatusCodes.OK).json({
		message: 'Sub head cost center amount fetched successfully',
		data,
	});
});

exports.deleteSubHeadCostCenterAmount = catchAsync(async (req, res) => {
	const { id } = req.params;

	await service.deleteSubHeadCostCenterAmount(req, id);

	res.status(StatusCodes.OK).json({
		message: 'Sub head cost center amount deleted successfully',
	});
});
