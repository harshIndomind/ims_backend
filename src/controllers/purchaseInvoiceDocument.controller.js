const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const purchaseInvoiceDocumentService = require('../services/purchaseInvoiceDocument.service');

exports.uploadDocuments = catchAsync(async (req, res) => {
	const { id: invoiceId } = req.params;
	const files = req.files;

	if (!files || files.length === 0) {
		return res.status(StatusCodes.BAD_REQUEST).json({
			message: 'No files provided',
		});
	}

	const data = await purchaseInvoiceDocumentService.uploadDocuments(req, invoiceId, files);

	res.status(StatusCodes.CREATED).json({
		message: 'Documents uploaded successfully',
		data,
	});
});

exports.getDocuments = catchAsync(async (req, res) => {
	const { id: invoiceId } = req.params;
	const data = await purchaseInvoiceDocumentService.getDocuments(invoiceId);

	res.status(StatusCodes.OK).json({
		message: 'Documents fetched successfully',
		data,
	});
});

exports.deleteDocument = catchAsync(async (req, res) => {
	const { id: invoiceId, docId } = req.params;
	await purchaseInvoiceDocumentService.deleteDocument(invoiceId, docId);

	res.status(StatusCodes.OK).json({
		message: 'Document deleted successfully',
	});
});
