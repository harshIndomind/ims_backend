const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const purchaseInvoiceService = require('../services/purchase-invoice.service');

exports.generateInvoiceNumber = catchAsync(async (req, res) => {
	const invoiceNumber = await purchaseInvoiceService.generateInvoiceNumber(req);
	ApiResponse.send(res, 200, 'Generated invoice number successfully', { invoiceNumber });
});

exports.getInvoiceableItems = catchAsync(async (req, res) => {
	const { document_type, document_id } = req.params;
	const result = await purchaseInvoiceService.getInvoiceableItems(req, { document_type, document_id });
	ApiResponse.send(res, 200, 'Fetched invoiceable items successfully', result);
});

exports.getExhaustedLookupIds = catchAsync(async (req, res) => {
	const { document_type } = req.params;
	const result = await purchaseInvoiceService.getExhaustedLookupIds(req, { document_type });
	ApiResponse.send(res, 200, 'Fetched exhausted lookup ids successfully', result);
});

exports.createPurchaseInvoice = catchAsync(async (req, res) => {
	const invoice = await purchaseInvoiceService.createPurchaseInvoice(req, req.body);
	ApiResponse.send(res, 201, 'Purchase Invoice created successfully', invoice);
});

exports.getAllPurchaseInvoices = catchAsync(async (req, res) => {
	const { count, rows } = await purchaseInvoiceService.listPurchaseInvoices(req, req.query);
	ApiResponse.send(res, 200, 'Purchase Invoices fetched successfully', { rows, count });
});

exports.getPurchaseInvoiceById = catchAsync(async (req, res) => {
	const invoice = await purchaseInvoiceService.getPurchaseInvoice(req, req.params.id);
	ApiResponse.send(res, 200, 'Purchase Invoice fetched successfully', invoice);
});

exports.approvePurchaseInvoice = catchAsync(async (req, res) => {
	const invoice = await purchaseInvoiceService.approvePurchaseInvoice(req, req.params.id);
	ApiResponse.send(res, 200, 'Purchase Invoice approved successfully', invoice);
});

exports.rejectPurchaseInvoice = catchAsync(async (req, res) => {
	const invoice = await purchaseInvoiceService.rejectPurchaseInvoice(req, req.params.id, req.body.remarks);
	ApiResponse.send(res, 200, 'Purchase Invoice rejected successfully', invoice);
});

exports.cancelPurchaseInvoice = catchAsync(async (req, res) => {
	const invoice = await purchaseInvoiceService.cancelPurchaseInvoice(req, req.params.id, req.body.remarks);
	ApiResponse.send(res, 200, 'Purchase Invoice cancelled successfully', invoice);
});

exports.getPurchaseInvoiceWorkflow = catchAsync(async (req, res) => {
	const workflow = await purchaseInvoiceService.getPurchaseInvoiceWorkflow(req, req.params.id);
	ApiResponse.send(res, 200, 'Purchase Invoice workflow fetched successfully', workflow);
});
