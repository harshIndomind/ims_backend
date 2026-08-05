const catchAsync = require('../utils/catchAsync');
const { generateInvoiceHTMLPDF } = require('../pdf/htmlPdfGenerator');
const purchaseOrderService = require('../services/purchase-order.service');
const ApiResponse = require('../utils/ApiResponse');

exports.createPurchaseOrder = catchAsync(async (req, res) => {
	console.log('CREATE PURCHASE ORDER BODY', req.body);
	// return
	const purchaseOrder = await purchaseOrderService.createPurchaseOrder(req);

	ApiResponse.send(
		res,
		201,
		'Purchase Order created successfully',
		purchaseOrder,
	);
});

exports.getAllPurchaseOrders = catchAsync(async (req, res) => {
	const purchaseOrder = await purchaseOrderService.getAllPurchaseOrders(req);
	ApiResponse.send(
		res,
		200,
		'Purchase Orders fetched successfully',
		purchaseOrder,
	);
});

exports.exportPurchaseOrders = catchAsync(async (req, res) => {
	const result = await purchaseOrderService.exportPurchaseOrders(req);
	res.status(200).json({
		message: 'Purchase orders exported successfully',
		path: result.path,
	});
});

exports.getPurchaseOrderById = catchAsync(async (req, res) => {
	const purchaseOrder = await purchaseOrderService.getPurchaseOrderById(req);
	ApiResponse.send(
		res,
		200,
		'A Purchase Order fetched successfully',
		purchaseOrder,
	);
});

exports.updatePurchaseOrder = catchAsync(async (req, res) => {
	console.log('UPDATE PURCHASE ORDER BODY', req.body);
	// return
	const updatedPurchaseOrder =
		await purchaseOrderService.updatePurchaseOrder(req);

	ApiResponse.send(
		res,
		201,
		'Purchase Order updated successfully',
		updatedPurchaseOrder,
	);
});

exports.deletePurchaseOrder = catchAsync(async (req, res) => {
	const deletePurchaseOrder =
		await purchaseOrderService.deletePurchaseOrder(req);
	res.status(200).json({
		message: 'Purchase order deleted successfully',
		data: deletePurchaseOrder,
	});
});

exports.generateInvoiceHtml = catchAsync(async (req, res) => {
	const combinedHtml = await purchaseOrderService.generateInvoiceHtml(req);
	res.json({ html: combinedHtml });
});

exports.downloadInvoicePdf = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;
		const { copies = [], html = '' } = req.body;

		const pdfPath = await generateInvoiceHTMLPDF(html, 'defaultTemplate', {
			multi: true,
		});

		res.json({ pdfUrl: pdfPath });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: err.message || 'Failed to generate HTML' });
	}
});

exports.submitPurchaseOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await purchaseOrderService.submitPurchaseOrder(req, id);
	res.status(200).json({ message: 'Purchase Order submitted for approval', data });
});

exports.approvePurchaseOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await purchaseOrderService.approvePurchaseOrder(req, id, remarks);
	res.status(200).json({ message: 'Purchase Order approved successfully', data });
});

exports.rejectPurchaseOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await purchaseOrderService.rejectPurchaseOrder(req, id, remarks);
	res.status(200).json({ message: 'Purchase Order rejected successfully', data });
});

exports.cancelPurchaseOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await purchaseOrderService.cancelPurchaseOrder(req, id, remarks);
	res.status(200).json({ message: 'Purchase Order cancelled successfully', data });
});

exports.reopenPurchaseOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await purchaseOrderService.reopenPurchaseOrder(req, id, remarks);
	res.status(200).json({ message: 'Purchase Order reopened successfully', data });
});

exports.archivePurchaseOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await purchaseOrderService.archivePurchaseOrder(req, id, remarks);
	res.status(200).json({ message: 'Purchase Order archived successfully', data });
});

exports.restorePurchaseOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await purchaseOrderService.restorePurchaseOrder(req, id, remarks);
	res.status(200).json({ message: 'Purchase Order restored successfully', data });
});

exports.getPurchaseOrderWorkflow = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await purchaseOrderService.getPurchaseOrderWorkflow(req, id);
	res.status(200).json({ message: 'Purchase Order workflow fetched successfully', data });
});

exports.dispatchPurchaseOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await purchaseOrderService.dispatchPurchaseOrder(req, id, req.body);
	res.status(200).json({ message: 'Purchase Order dispatched successfully', data });
});

exports.acknowledgePurchaseOrder = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await purchaseOrderService.acknowledgePurchaseOrder(req, id, req.body, req.file);
	res.status(200).json({ message: 'Purchase Order acknowledgement recorded successfully', data });
});

exports.listPurchaseOrderDispatches = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await purchaseOrderService.listPurchaseOrderDispatches(id);
	res.status(200).json({ message: 'Purchase Order dispatches fetched successfully', data });
});

exports.listPurchaseOrderAcknowledgements = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await purchaseOrderService.listPurchaseOrderAcknowledgements(id);
	res.status(200).json({ message: 'Purchase Order acknowledgements fetched successfully', data });
});
