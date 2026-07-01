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

exports.generatePoNumber = catchAsync(async (req, res) => {
	const purchaseOrderNumber =
		await purchaseOrderService.getPurchaseOrderNo(req);
	res.status(200).json({
		message: 'Generated purchase order number successfully',
		data: purchaseOrderNumber,
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
