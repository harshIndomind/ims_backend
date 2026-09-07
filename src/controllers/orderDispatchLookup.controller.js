const catchAsync = require('../utils/catchAsync');
const orderDispatchService = require('../services/orderDispatch.service');
const {
	masterQcRejectionReasonRepository,
	masterShortCloseReasonRepository,
	masterOtherChargeTypeRepository,
} = require('../repository/index');

exports.getDispatchMethods = catchAsync(async (req, res) => {
	const data = await orderDispatchService.listDispatchMethods();
	res.status(200).json({ message: 'Dispatch methods fetched successfully', data });
});

exports.getAcknowledgementModes = catchAsync(async (req, res) => {
	const data = await orderDispatchService.listAcknowledgementModes();
	res.status(200).json({ message: 'Acknowledgement modes fetched successfully', data });
});

exports.getQcRejectionReasons = catchAsync(async (req, res) => {
	const data = await masterQcRejectionReasonRepository.findAllActive();
	res.status(200).json({ message: 'QC rejection reasons fetched successfully', data });
});

exports.getShortCloseReasons = catchAsync(async (req, res) => {
	const data = await masterShortCloseReasonRepository.findAllActive();
	res.status(200).json({ message: 'Short close reasons fetched successfully', data });
});

exports.getOtherChargeTypes = catchAsync(async (req, res) => {
	const data = await masterOtherChargeTypeRepository.findAllActive();
	res.status(200).json({ message: 'Other charge types fetched successfully', data });
});
