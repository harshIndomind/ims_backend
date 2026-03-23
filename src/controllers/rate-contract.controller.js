const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const rateContractService = require('../services/rate-contract.service');

exports.createRateContract = catchAsync(async (req, res) => {
	const data = await rateContractService.createRateContract(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Rate Contract Created Successfully',
		data,
	});
});

exports.updateRateContract = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await rateContractService.updateRateContract(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Rate Contract Updated Successfully',
		data,
	});
});

exports.getAllRateContract = catchAsync(async (req, res) => {
	const data = await rateContractService.getAllRateContract(req);

	res.status(StatusCodes.OK).json({ data });
});

exports.getRateContractById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await rateContractService.getRateContractById(id);

	res.status(StatusCodes.OK).json({
		message: 'Rate Contract Fetched Successfully',
		data,
	});
});

exports.deleteRateContract = catchAsync(async (req, res) => {
	const { id } = req.params;

	await rateContractService.deleteRateContract(id);

	res.status(StatusCodes.OK).json({
		message: 'Rate Contract Deleted Successfully',
	});
});
