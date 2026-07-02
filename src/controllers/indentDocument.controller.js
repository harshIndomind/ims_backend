const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const indentDocumentService = require('../services/indentDocument.service');

exports.uploadDocuments = catchAsync(async (req, res) => {
	const { id: indentId } = req.params;
	const files = req.files;

	if (!files || files.length === 0) {
		return res.status(StatusCodes.BAD_REQUEST).json({
			message: 'No files provided',
		});
	}

	const data = await indentDocumentService.uploadDocuments(req, indentId, files);

	res.status(StatusCodes.CREATED).json({
		message: 'Documents uploaded successfully',
		data,
	});
});

exports.getDocuments = catchAsync(async (req, res) => {
	const { id: indentId } = req.params;
	const data = await indentDocumentService.getDocuments(indentId);

	res.status(StatusCodes.OK).json({
		message: 'Documents fetched successfully',
		data,
	});
});

exports.deleteDocument = catchAsync(async (req, res) => {
	const { id: indentId, docId } = req.params;
	await indentDocumentService.deleteDocument(indentId, docId);

	res.status(StatusCodes.OK).json({
		message: 'Document deleted successfully',
	});
});
