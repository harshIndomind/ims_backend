const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const companyService = require('../services/company.service');

exports.createCompany = catchAsync(async (req, res) => {
	const data = await companyService.createCompany(req, req.body);
	res.status(StatusCodes.CREATED).json({
		message: 'Company created successfully',
		data,
	});
});

exports.updateCompany = catchAsync(async (req, res) => {
	const data = await companyService.updateCompany(req, req.params.id, req.body);
	res.status(StatusCodes.OK).json({
		message: 'Company updated successfully',
		data,
	});
});

exports.getAllCompanies = catchAsync(async (req, res) => {
	const data = await companyService.getAllCompanies(req);
	res.status(StatusCodes.OK).json({ data });
});

exports.getCompanyById = catchAsync(async (req, res) => {
	const data = await companyService.getCompanyById(req, req.params.id);
	res.status(StatusCodes.OK).json({
		message: 'Company fetched successfully',
		data,
	});
});

exports.deleteCompany = catchAsync(async (req, res) => {
	await companyService.deleteCompany(req, req.params.id);
	res.status(StatusCodes.OK).json({
		message: 'Company deleted successfully',
	});
});