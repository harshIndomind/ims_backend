const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const masterAccountService = require('../services/masterAccount.service');

exports.createMasterAccount = catchAsync(async (req, res) => {
	const data = await masterAccountService.createMasterAccount(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Master Account created successfully',
		data,
	});
});

exports.updateMasterAccount = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterAccountService.updateMasterAccount(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Master Account updated successfully',
		data,
	});
});

exports.getAllMasterAccount = catchAsync(async (req, res) => {
	const { limit, offset } = req.query;

	const options = {};
	if(limit){
		options.limit = Number(limit);
		options.offset = Number(offset);
	}

	const data = await masterAccountService.getAllMasterAccount(options);

	res.status(StatusCodes.OK).json({ data });
});

exports.getMasterAccountById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterAccountService.getMasterAccountById(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Account fetched successfully',
		data,
	});
});

exports.deleteMasterAccount = catchAsync(async (req, res) => {
	const { id } = req.params;

	await masterAccountService.deleteMasterAccount(id);

	res.status(StatusCodes.OK).json({
		message: 'Master Account deleted successfully',
	});
});
