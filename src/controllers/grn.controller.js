const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const grnService = require('../services/grn.service');

exports.generateGrnNumber = catchAsync(async (req, res) => {
	const grnNumber = await grnService.generateGrnNumber(req);
	ApiResponse.send(res, 200, 'Generated GRN number successfully', { grnNumber });
});

exports.createGRN = catchAsync(async (req, res) => {
	const grn = await grnService.createGRN(req);
	ApiResponse.send(res, 201, 'Goods Receipt Note created successfully', grn);
});

exports.getAllGRNs = catchAsync(async (req, res) => {
	const { count, rows } = await grnService.getAllGRNs(req);
	ApiResponse.send(res, 200, 'Goods Receipt Notes fetched successfully', { rows, count });
});

exports.cancelGRN = catchAsync(async (req, res) => {
	const grn = await grnService.cancelGRN(req, req.params.id);
	ApiResponse.send(res, 200, 'Goods Receipt Note cancelled successfully', grn);
});

exports.getGRNsByPurchaseOrder = catchAsync(async (req, res) => {
	const grns = await grnService.getGRNsByPurchaseOrder(req, req.params.purchaseOrderId);
	ApiResponse.send(res, 200, 'Goods Receipt Notes fetched successfully', grns);
});

exports.getReceivableLinesForPurchaseOrder = catchAsync(async (req, res) => {
	const result = await grnService.getReceivableLinesForPurchaseOrder(req, req.params.purchaseOrderId);
	ApiResponse.send(res, 200, 'Receivable lines fetched successfully', result);
});

exports.getGRNById = catchAsync(async (req, res) => {
	const grn = await grnService.getGRNById(req, req.params.id);
	ApiResponse.send(res, 200, 'Goods Receipt Note fetched successfully', grn);
});
