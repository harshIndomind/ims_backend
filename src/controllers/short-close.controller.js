const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const shortCloseService = require('../services/short-close.service');

exports.generateRequestNumber = catchAsync(async (req, res) => {
	const requestNumber = await shortCloseService.generateRequestNumber(req);
	ApiResponse.send(res, 200, 'Generated request number successfully', { requestNumber });
});

exports.getShortCloseableItems = catchAsync(async (req, res) => {
	const { document_type, document_id } = req.params;
	const result = await shortCloseService.getShortCloseableItems(req, { document_type, document_id });
	ApiResponse.send(res, 200, 'Fetched short-closeable items successfully', result);
});

exports.createShortCloseRequest = catchAsync(async (req, res) => {
	const request = await shortCloseService.createShortCloseRequest(req, req.body);
	ApiResponse.send(res, 201, 'Short Close Request created successfully', request);
});

exports.getAllShortCloseRequests = catchAsync(async (req, res) => {
	const { count, rows } = await shortCloseService.listShortCloseRequests(req, req.query);
	ApiResponse.send(res, 200, 'Short Close Requests fetched successfully', { rows, count });
});

exports.getShortCloseRequestById = catchAsync(async (req, res) => {
	const request = await shortCloseService.getShortCloseRequest(req, req.params.id);
	ApiResponse.send(res, 200, 'Short Close Request fetched successfully', request);
});

exports.approveShortCloseRequest = catchAsync(async (req, res) => {
	const request = await shortCloseService.approveShortCloseRequest(req, req.params.id);
	ApiResponse.send(res, 200, 'Short Close Request approved successfully', request);
});

exports.rejectShortCloseRequest = catchAsync(async (req, res) => {
	const request = await shortCloseService.rejectShortCloseRequest(req, req.params.id, req.body.remarks);
	ApiResponse.send(res, 200, 'Short Close Request rejected successfully', request);
});

exports.cancelShortCloseRequest = catchAsync(async (req, res) => {
	const request = await shortCloseService.cancelShortCloseRequest(req, req.params.id, req.body.remarks);
	ApiResponse.send(res, 200, 'Short Close Request cancelled successfully', request);
});

exports.getShortCloseWorkflow = catchAsync(async (req, res) => {
	const workflow = await shortCloseService.getShortCloseWorkflow(req, req.params.id);
	ApiResponse.send(res, 200, 'Short Close Request workflow fetched successfully', workflow);
});
