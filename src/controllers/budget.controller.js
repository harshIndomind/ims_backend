const path = require('path');
const fs = require('fs').promises;
const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const budgetService = require('../services/budget.service');
const budgetReportService = require('../services/budget-report.service');
const { BASE_URL } = require('../config/serverConfig');
const logger = require('../utils/logger');

exports.createBudget = catchAsync(async (req, res) => {
	console.log('req.body ', req.body);

	const data = await budgetService.createBudget(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Budget created successfully',
		data,
	});
});

exports.updateBudget = catchAsync(async (req, res) => {
	const { id } = req.params;
	console.log('req.body ', req.body);

	const data = await budgetService.updateBudget(req, id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Budget updated successfully',
		data,
	});
});

exports.getAllBudgets = catchAsync(async (req, res) => {
	const data = await budgetService.getAllBudgets(req);

	res.status(StatusCodes.OK).json({ data });
});

exports.searchBudgets = catchAsync(async (req, res) => {
	const { org_id } = req.user;
	const { search, limit } = req.query;
	const data = await budgetService.searchBudgets({ org_id, search, limit });
	res.status(StatusCodes.OK).json({ data });
});

exports.getBudgetById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const data = await budgetService.getBudgetById(id);

	res.status(StatusCodes.OK).json({
		message: 'Budget fetched successfully',
		data,
	});
});

exports.deleteBudget = catchAsync(async (req, res) => {
	const { id } = req.params;

	await budgetService.deleteBudget(req, id);

	res.status(StatusCodes.OK).json({
		message: 'Budget deleted successfully',
	});
});

exports.getAmountByMajorHeadAndPeriodAndSubHead = catchAsync(
	async (req, res) => {
		const { major_head_id, period_id, subhead_id } = req.params;
		const { exclude_budget_id } = req.query;
		logger.info('Sanctioned Amount Controller', {
			major_head_id,
			period_id,
			subhead_id,
			exclude_budget_id,
		});
		const data = await budgetService.getAmountByMajorHeadAndPeriodAndSubHead(
			major_head_id,
			period_id,
			subhead_id,
			exclude_budget_id,
		);

		res.status(StatusCodes.OK).json({
			message: 'Sanctioned amount fetched successfully',
			data,
		});
	},
);

exports.approveBudget = catchAsync(async (req, res) => {
	const { ids } = req.body;
	const data = await budgetService.approveBudget(req, ids, req.user.id);

	res.status(StatusCodes.OK).json({
		message: 'Budgets approved successfully',
		data,
	});
});

exports.getAllApprovedBudgets = catchAsync(async (req, res) => {
	const data = await budgetService.getAllApprovedBudgets(req);

	res.status(StatusCodes.OK).json({ data });
});

const BUDGET_STORAGE_DIR = path.join(__dirname, '../../storage/budgets');
const SAFE_FILENAME_RE = /^budget_report_[\d_-]+\.xlsx$/;

exports.downloadBudgetReport = catchAsync(async (req, res) => {
	const data = await budgetService.getAllBudgets(req);

	if (!data.rows || data.rows.length === 0) {
		return res
			.status(StatusCodes.NO_CONTENT)
			.json({ message: 'Budget data is not available' });
	}

	await fs.mkdir(BUDGET_STORAGE_DIR, { recursive: true });

	const now = new Date();
	const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
	const fileName = `budget_report_${ts}.xlsx`;
	const filePath = path.join(BUDGET_STORAGE_DIR, fileName);

	await budgetReportService.generateExcel(data, filePath);

	const baseUrl = BASE_URL || 'http://localhost:4300';
	res.status(StatusCodes.OK).json({
		message: 'Budget report generated successfully',
		fileName,
		path: `${baseUrl}/storage/budgets/${fileName}`,
	});
});

exports.cleanupBudgetReport = catchAsync(async (req, res) => {
	const { name } = req.query;
	console.log("name ", SAFE_FILENAME_RE.test(name));
	
	if (!name || !SAFE_FILENAME_RE.test(name)) {
		return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file name' });
	}

	const filePath = path.join(BUDGET_STORAGE_DIR, name);
	await fs.unlink(filePath).catch(() => {});

	res.status(StatusCodes.OK).json({ message: 'Report file deleted' });
});
