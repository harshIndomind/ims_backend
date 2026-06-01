const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const workOrderService = require('../services/work-order.service');

exports.createWorkOrder = catchAsync(async (req, res) => {
	const workOrder = await workOrderService.createWorkOrder(req);
	ApiResponse.send(res, 201, 'Work Order created successfully', workOrder);
});

exports.getAllWorkOrders = catchAsync(async (req, res) => {
	const workOrders = await workOrderService.getAllWorkOrders(req);
	ApiResponse.send(res, 200, 'Work Orders fetched successfully', workOrders);
});

exports.getWorkOrderById = catchAsync(async (req, res) => {
	const workOrder = await workOrderService.getWorkOrderById(req);
	ApiResponse.send(res, 200, 'Work Order fetched successfully', workOrder);
});

exports.updateWorkOrder = catchAsync(async (req, res) => {
	const updatedWorkOrder = await workOrderService.updateWorkOrder(req);
	ApiResponse.send(res, 200, 'Work Order updated successfully', updatedWorkOrder);
});

exports.deleteWorkOrder = catchAsync(async (req, res) => {
	await workOrderService.deleteWorkOrder(req);
	res.status(200).json({ message: 'Work order deleted successfully' });
});

exports.generateWoNumber = catchAsync(async (req, res) => {
	const workOrderNumber = await workOrderService.getWorkOrderNo(req);
	res.status(200).json({
		message: 'Generated work order number successfully',
		data: workOrderNumber,
	});
});

exports.generateInvoiceHtml = catchAsync(async (req, res) => {
	const combinedHtml = await workOrderService.generateInvoiceHtml(req);
	res.json({ html: combinedHtml });
});

exports.downloadInvoicePdf = catchAsync(async (req, res) => {
	const pdfUrl = await workOrderService.downloadInvoicePdf(req);
	res.json({ pdfUrl });
});
