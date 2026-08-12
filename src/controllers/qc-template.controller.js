const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const qcTemplateService = require('../services/qc-template.service');

exports.createTemplate = catchAsync(async (req, res) => {
	const template = await qcTemplateService.createTemplate(req, req.body);
	ApiResponse.send(res, 201, 'QC template created successfully', template);
});

exports.getAllTemplates = catchAsync(async (req, res) => {
	const { count, rows } = await qcTemplateService.getAllTemplates(req);
	ApiResponse.send(res, 200, 'QC templates fetched successfully', { rows, count });
});

exports.getTemplateById = catchAsync(async (req, res) => {
	const template = await qcTemplateService.getTemplateById(req, req.params.id);
	ApiResponse.send(res, 200, 'QC template fetched successfully', template);
});

exports.deactivateTemplate = catchAsync(async (req, res) => {
	const template = await qcTemplateService.deactivateTemplate(req, req.params.id);
	ApiResponse.send(res, 200, 'QC template deactivated successfully', template);
});
