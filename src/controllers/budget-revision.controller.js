const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const budgetRevisionService = require('../services/budget-revision.service');

exports.createBudgetRevision = catchAsync(async (req, res) => {
	const revision = await budgetRevisionService.createBudgetRevision(req, req.body);
	ApiResponse.send(res, 201, 'Budget Revision submitted successfully', revision);
});

exports.getAllBudgetRevisions = catchAsync(async (req, res) => {
	const { count, rows } = await budgetRevisionService.listBudgetRevisions(req, req.query);
	ApiResponse.send(res, 200, 'Budget Revisions fetched successfully', { rows, count });
});

exports.getBudgetRevisionById = catchAsync(async (req, res) => {
	const revision = await budgetRevisionService.getBudgetRevision(req, req.params.id);
	ApiResponse.send(res, 200, 'Budget Revision fetched successfully', revision);
});

exports.approveBudgetRevision = catchAsync(async (req, res) => {
	const revision = await budgetRevisionService.approveBudgetRevision(req, req.params.id, req.body?.remarks);
	ApiResponse.send(res, 200, 'Budget Revision approved successfully', revision);
});

exports.rejectBudgetRevision = catchAsync(async (req, res) => {
	const revision = await budgetRevisionService.rejectBudgetRevision(req, req.params.id, req.body.remarks);
	ApiResponse.send(res, 200, 'Budget Revision rejected successfully', revision);
});

exports.cancelBudgetRevision = catchAsync(async (req, res) => {
	const revision = await budgetRevisionService.cancelBudgetRevision(req, req.params.id, req.body.remarks);
	ApiResponse.send(res, 200, 'Budget Revision cancelled successfully', revision);
});

exports.getBudgetRevisionWorkflow = catchAsync(async (req, res) => {
	const workflow = await budgetRevisionService.getBudgetRevisionWorkflow(req, req.params.id);
	ApiResponse.send(res, 200, 'Budget Revision workflow fetched successfully', workflow);
});
