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

exports.getRateContractByProductId = catchAsync(async (req, res) => {
	const { product_id } = req.params;
	const { unit_id, date, supplier_id } = req.query;

	const data = await rateContractService.getRateContractByProductId(product_id, {
		unit_id,
		date,
		org_id: req.user.org_id,
		supplier_id,
	});

	res.status(StatusCodes.OK).json({
		message: 'Rate Contract Fetched Successfully',
		data,
	});
});

exports.getRateContractsByProductIds = catchAsync(async (req, res) => {
	const { product_ids, unit_id, date, supplier_id } = req.body;

	const ids = Array.isArray(product_ids) ? product_ids : [];

	const data = await rateContractService.getRateContractsByProductIds(ids, {
		unit_id,
		date,
		org_id: req.user.org_id,
		supplier_id,
	});

	res.status(StatusCodes.OK).json({
		message: 'Rate Contracts Fetched Successfully',
		data,
	});
});

exports.approveRateContract = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await rateContractService.approveRateContract(id, req.user);

	res.status(StatusCodes.OK).json({
		message: 'Rate Contract Approved Successfully',
		data,
	});
});

exports.createNewVersion = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await rateContractService.createNewVersion(id, req.body, req);

	res.status(StatusCodes.CREATED).json({
		message: 'New Rate Contract Version Created Successfully',
		data,
	});
});