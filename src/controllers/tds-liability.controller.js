const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const tdsLiabilityService = require('../services/tds-liability.service');

exports.getAllTdsLiabilities = catchAsync(async (req, res) => {
	const data = await tdsLiabilityService.getAllTdsLiabilities(req);
	res.status(StatusCodes.OK).json({ message: 'TDS liabilities fetched successfully', data });
});

exports.getTdsSummary = catchAsync(async (req, res) => {
	const data = await tdsLiabilityService.getTdsSummary(req);
	res.status(StatusCodes.OK).json({ message: 'TDS summary fetched successfully', data });
});

exports.getTdsLiabilityById = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await tdsLiabilityService.getTdsLiabilityById(req, id);
	res.status(StatusCodes.OK).json({ message: 'TDS liability fetched successfully', data });
});
