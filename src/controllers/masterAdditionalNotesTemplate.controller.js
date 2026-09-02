const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const masterAdditionalNotesTemplateService = require('../services/masterAdditionalNotesTemplate.service');

exports.createTemplate = catchAsync(async (req, res) => {
	const data = await masterAdditionalNotesTemplateService.createTemplate(
		req.body,
		req.user.org_id,
	);

	res.status(StatusCodes.CREATED).json({
		message: 'Additional Notes Template created successfully',
		data,
	});
});

exports.updateTemplate = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterAdditionalNotesTemplateService.updateTemplate(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Additional Notes Template updated successfully',
		data,
	});
});

exports.getAllTemplates = catchAsync(async (req, res) => {
	const data = await masterAdditionalNotesTemplateService.getAllTemplates(req);

	res.status(StatusCodes.OK).json({ data });
});

exports.getTemplateById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await masterAdditionalNotesTemplateService.getTemplateById(id);

	res.status(StatusCodes.OK).json({
		message: 'Additional Notes Template fetched successfully',
		data,
	});
});

exports.deleteTemplate = catchAsync(async (req, res) => {
	const { id } = req.params;

	await masterAdditionalNotesTemplateService.deleteTemplate(id);

	res.status(StatusCodes.OK).json({
		message: 'Additional Notes Template deleted successfully',
	});
});

exports.getTemplateForVendor = catchAsync(async (req, res) => {
	const { vendor_id, type } = req.query;

	const data = await masterAdditionalNotesTemplateService.getTemplateForVendor(
		vendor_id,
		type,
		req.user.org_id,
	);

	res.status(StatusCodes.OK).json({
		message: data ? 'Template found' : 'No template found for this vendor',
		data,
	});
});