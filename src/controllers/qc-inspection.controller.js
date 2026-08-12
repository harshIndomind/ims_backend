const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const qcInspectionService = require('../services/qc-inspection.service');

exports.generateQcNumber = catchAsync(async (req, res) => {
	const qcNumber = await qcInspectionService.generateQcNumber(req);
	ApiResponse.send(res, 200, 'Generated QC number successfully', { qcNumber });
});

exports.createInspection = catchAsync(async (req, res) => {
	const inspection = await qcInspectionService.createInspection(req, req.body);
	ApiResponse.send(res, 201, 'QC Inspection created successfully', inspection);
});

exports.getAllInspections = catchAsync(async (req, res) => {
	const { count, rows } = await qcInspectionService.getAllInspections(req);
	ApiResponse.send(res, 200, 'QC Inspections fetched successfully', { rows, count });
});

exports.getInspectionById = catchAsync(async (req, res) => {
	const inspection = await qcInspectionService.getInspectionById(req, req.params.id);
	ApiResponse.send(res, 200, 'QC Inspection fetched successfully', inspection);
});

exports.getRemainingForDocument = catchAsync(async (req, res) => {
	const remaining = await qcInspectionService.getRemainingForDocument(req, {
		document_type: req.params.document_type,
		document_id: req.params.document_id,
	});
	ApiResponse.send(res, 200, 'Remaining QC quantities fetched successfully', remaining);
});

exports.assignInspector = catchAsync(async (req, res) => {
	const inspection = await qcInspectionService.assignInspector(req, req.params.id, req.body);
	ApiResponse.send(res, 200, 'Inspector assigned successfully', inspection);
});

exports.startInspection = catchAsync(async (req, res) => {
	const inspection = await qcInspectionService.startInspection(req, req.params.id);
	ApiResponse.send(res, 200, 'Inspection started successfully', inspection);
});

exports.saveItems = catchAsync(async (req, res) => {
	const inspection = await qcInspectionService.saveItems(req, req.params.id, req.body);
	ApiResponse.send(res, 200, 'Inspection items saved successfully', inspection);
});

exports.submitInspection = catchAsync(async (req, res) => {
	const inspection = await qcInspectionService.submitInspection(req, req.params.id);
	ApiResponse.send(res, 200, 'Inspection submitted for approval', inspection);
});

exports.approveInspection = catchAsync(async (req, res) => {
	const inspection = await qcInspectionService.approveInspection(req, req.params.id);
	ApiResponse.send(res, 200, 'QC Inspection approved successfully', inspection);
});

exports.rejectInspection = catchAsync(async (req, res) => {
	const inspection = await qcInspectionService.rejectInspection(req, req.params.id, req.body.remarks);
	ApiResponse.send(res, 200, 'QC Inspection rejected', inspection);
});

exports.cancelInspection = catchAsync(async (req, res) => {
	const inspection = await qcInspectionService.cancelInspection(req, req.params.id, req.body.remarks);
	ApiResponse.send(res, 200, 'QC Inspection cancelled', inspection);
});

exports.reinspect = catchAsync(async (req, res) => {
	const inspection = await qcInspectionService.reinspect(req, req.params.id);
	ApiResponse.send(res, 201, 'Re-inspection created successfully', inspection);
});

exports.getInspectionWorkflow = catchAsync(async (req, res) => {
	const workflow = await qcInspectionService.getInspectionWorkflow(req, req.params.id);
	ApiResponse.send(res, 200, 'QC Inspection workflow fetched successfully', workflow);
});

exports.listAttachments = catchAsync(async (req, res) => {
	const attachments = await qcInspectionService.listAttachments(req, req.params.id);
	ApiResponse.send(res, 200, 'Attachments fetched successfully', attachments);
});

exports.uploadAttachment = catchAsync(async (req, res) => {
	const attachment = await qcInspectionService.uploadAttachment(req, req.params.id, req.file);
	ApiResponse.send(res, 201, 'Attachment uploaded successfully', attachment);
});
