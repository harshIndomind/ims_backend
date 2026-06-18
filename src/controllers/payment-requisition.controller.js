const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const paymentRequisitionService = require('../services/payment-requisition.service');

exports.getNextRequisitionNo = catchAsync(async (req, res) => {
	const requisitionNo = await paymentRequisitionService.getNextRequisitionNo(req);
	res.status(StatusCodes.OK).json({ message: 'Requisition number generated successfully', data: { requisitionNo } });
});

exports.createPaymentRequisition = catchAsync(async (req, res) => {
	const data = await paymentRequisitionService.createPaymentRequisition(req, req.body);
	res.status(StatusCodes.CREATED).json({ message: 'Payment requisition created successfully', data });
});

exports.getAllPaymentRequisitions = catchAsync(async (req, res) => {
	const data = await paymentRequisitionService.getAllPaymentRequisitions(req);
	res.status(StatusCodes.OK).json({ message: 'Payment requisitions fetched successfully', data });
});

exports.getPaymentRequisitionById = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await paymentRequisitionService.getPaymentRequisitionById(req, id);
	res.status(StatusCodes.OK).json({ message: 'Payment requisition fetched successfully', data });
});

exports.updatePaymentRequisition = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await paymentRequisitionService.updatePaymentRequisition(req, id, req.body);
	res.status(StatusCodes.OK).json({ message: 'Payment requisition updated successfully', data });
});

exports.deletePaymentRequisition = catchAsync(async (req, res) => {
	const { id } = req.params;
	await paymentRequisitionService.deletePaymentRequisition(req, id);
	res.status(StatusCodes.OK).json({ message: 'Payment requisition deleted successfully' });
});

// Deduction sub-resources
exports.addDeduction = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await paymentRequisitionService.addDeduction(req, id, req.body);
	res.status(StatusCodes.CREATED).json({ message: 'Deduction added successfully', data });
});

exports.updateDeduction = catchAsync(async (req, res) => {
	const { id, deductionId } = req.params;
	const data = await paymentRequisitionService.updateDeduction(req, id, deductionId, req.body);
	res.status(StatusCodes.OK).json({ message: 'Deduction updated successfully', data });
});

exports.deleteDeduction = catchAsync(async (req, res) => {
	const { id, deductionId } = req.params;
	await paymentRequisitionService.deleteDeduction(req, id, deductionId);
	res.status(StatusCodes.OK).json({ message: 'Deduction deleted successfully' });
});

// Summaries
exports.getPoWoSummary = catchAsync(async (req, res) => {
	const { type, id } = req.query;
	const data = await paymentRequisitionService.getPoWoSummary(req, type, id);
	res.status(StatusCodes.OK).json({ message: 'PO/WO summary fetched successfully', data });
});

exports.getDeductionAnalytics = catchAsync(async (req, res) => {
	const { type, id } = req.query;
	const data = await paymentRequisitionService.getDeductionAnalytics(req, type, id);
	res.status(StatusCodes.OK).json({ message: 'Deduction analytics fetched successfully', data });
});

// Retention release
exports.createRetentionRelease = catchAsync(async (req, res) => {
	const data = await paymentRequisitionService.createRetentionRelease(req, req.body);
	res.status(StatusCodes.CREATED).json({ message: 'Retention release requisition created', data });
});

// PDF / HTML
exports.generateRequisitionHtml = catchAsync(async (req, res) => {
	const html = await paymentRequisitionService.generateRequisitionHtml(req);
	res.status(StatusCodes.OK).json({ html });
});

exports.downloadRequisitionPdf = catchAsync(async (req, res) => {
	const pdfUrl = await paymentRequisitionService.downloadRequisitionPdf(req);
	res.status(StatusCodes.OK).json({ pdfUrl });
});
