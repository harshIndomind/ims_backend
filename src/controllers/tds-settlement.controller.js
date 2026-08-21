const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const tdsSettlementService = require('../services/tds-settlement.service');

exports.createTdsSettlement = catchAsync(async (req, res) => {
	const data = await tdsSettlementService.createTdsSettlement(req, req.body);
	res.status(StatusCodes.CREATED).json({ message: 'TDS settlement recorded successfully', data });
});

exports.getAllTdsSettlements = catchAsync(async (req, res) => {
	const data = await tdsSettlementService.getAllTdsSettlements(req);
	res.status(StatusCodes.OK).json({ message: 'TDS settlements fetched successfully', data });
});

exports.getTdsSettlementById = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await tdsSettlementService.getTdsSettlementById(req, id);
	res.status(StatusCodes.OK).json({ message: 'TDS settlement fetched successfully', data });
});

exports.reverseTdsSettlement = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { reason } = req.body;
	const data = await tdsSettlementService.reverseTdsSettlement(req, id, reason);
	res.status(StatusCodes.OK).json({ message: 'TDS settlement reversed successfully', data });
});
