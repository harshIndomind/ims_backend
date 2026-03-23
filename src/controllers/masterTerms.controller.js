const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const masterTermsService = require('../services/masterTerms.service');

exports.createMasterTerms = catchAsync(async (req, res) => {
	const data = await masterTermsService.createMasterTerms(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Master Terms created successfully',
		data,
	});
});

exports.updateMasterTerms = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterTermsService.updateMasterTerms(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Master Terms updated successfully',
		data,
	});
});

exports.getAllMasterTerms = catchAsync(async (req, res) => {
	const data = await masterTermsService.getAllMasterTerms(req);

	res.status(StatusCodes.OK).json({ data });
});

exports.getMasterTermsById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterTermsService.getMasterTermsById(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Terms fetched successfully',
		data,
	});
});

exports.deleteMasterTerms = catchAsync(async (req, res) => {
	const { id } = req.params;

	await masterTermsService.deleteMasterTerms(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Terms deleted successfully',
	});
});
