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

exports.exportWorkOrders = catchAsync(async (req, res) => {
	const result = await workOrderService.exportWorkOrders(req);
	res.status(200).json({
		message: 'Work orders exported successfully',
		path: result.path,
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

exports.submitWorkOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await workOrderService.submitWorkOrder(req, id);
	res.status(200).json({ message: 'Work Order submitted for approval', data });
});

exports.approveWorkOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await workOrderService.approveWorkOrder(req, id, remarks);
	res.status(200).json({ message: 'Work Order approved successfully', data });
});

exports.rejectWorkOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await workOrderService.rejectWorkOrder(req, id, remarks);
	res.status(200).json({ message: 'Work Order rejected successfully', data });
});

exports.cancelWorkOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await workOrderService.cancelWorkOrder(req, id, remarks);
	res.status(200).json({ message: 'Work Order cancelled successfully', data });
});

exports.reopenWorkOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await workOrderService.reopenWorkOrder(req, id, remarks);
	res.status(200).json({ message: 'Work Order reopened successfully', data });
});

exports.archiveWorkOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await workOrderService.archiveWorkOrder(req, id, remarks);
	res.status(200).json({ message: 'Work Order archived successfully', data });
});

exports.restoreWorkOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await workOrderService.restoreWorkOrder(req, id, remarks);
	res.status(200).json({ message: 'Work Order restored successfully', data });
});

exports.getWorkOrderWorkflow = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await workOrderService.getWorkOrderWorkflow(req, id);
	res.status(200).json({ message: 'Work Order workflow fetched successfully', data });
});

exports.dispatchWorkOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await workOrderService.dispatchWorkOrder(req, id, req.body);
	res.status(200).json({ message: 'Work Order dispatched successfully', data });
});

exports.acknowledgeWorkOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await workOrderService.acknowledgeWorkOrder(req, id, req.body, req.file);
	res.status(200).json({ message: 'Work Order acknowledgement recorded successfully', data });
});

exports.listWorkOrderDispatches = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await workOrderService.listWorkOrderDispatches(id);
	res.status(200).json({ message: 'Work Order dispatches fetched successfully', data });
});

exports.listWorkOrderAcknowledgements = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await workOrderService.listWorkOrderAcknowledgements(id);
	res.status(200).json({ message: 'Work Order acknowledgements fetched successfully', data });
});
