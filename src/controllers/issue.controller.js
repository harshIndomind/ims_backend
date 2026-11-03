const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const issueService = require('../services/issue.service');

exports.createIssue = catchAsync(async (req, res) => {
	const data = await issueService.createIssue(req, req.body);
	res.status(StatusCodes.CREATED).json({
		message: 'Issue created successfully',
		data,
	});
});

exports.updateIssue = catchAsync(async (req, res) => {
	const data = await issueService.updateIssue(req, req.params.id, req.body);
	res.status(StatusCodes.OK).json({
		message: 'Issue updated successfully',
		data,
	});
});

exports.getAllIssues = catchAsync(async (req, res) => {
	const data = await issueService.getAllIssues(req);
	res.status(StatusCodes.OK).json({ data });
});

exports.getIssueById = catchAsync(async (req, res) => {
	const data = await issueService.getIssueById(req, req.params.id);
	res.status(StatusCodes.OK).json({
		message: 'Issue fetched successfully',
		data,
	});
});

exports.getAssignees = catchAsync(async (req, res) => {
	const data = await issueService.getAssignees(req);
	res.status(StatusCodes.OK).json({ data });
});

exports.getSummary = catchAsync(async (req, res) => {
	const data = await issueService.getSummary(req);
	res.status(StatusCodes.OK).json({ data });
});

exports.deleteIssue = catchAsync(async (req, res) => {
	await issueService.deleteIssue(req, req.params.id);
	res.status(StatusCodes.OK).json({
		message: 'Issue deleted successfully',
	});
});