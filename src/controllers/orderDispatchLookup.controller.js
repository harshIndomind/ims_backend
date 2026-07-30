const catchAsync = require('../utils/catchAsync');
const orderDispatchService = require('../services/orderDispatch.service');

exports.getDispatchMethods = catchAsync(async (req, res) => {
	const data = await orderDispatchService.listDispatchMethods();
	res.status(200).json({ message: 'Dispatch methods fetched successfully', data });
});

exports.getAcknowledgementModes = catchAsync(async (req, res) => {
	const data = await orderDispatchService.listAcknowledgementModes();
	res.status(200).json({ message: 'Acknowledgement modes fetched successfully', data });
});
