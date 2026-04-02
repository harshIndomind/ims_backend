const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const budgetService = require('../services/budget.service');
const budgetReportService = require('../services/budget-report.service');
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

	const data = await budgetService.updateBudget(id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Budget updated successfully',
		data,
	});
});

exports.getAllBudgets = catchAsync(async (req, res) => {
	const data = await budgetService.getAllBudgets(req);

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

	await budgetService.deleteBudget(id);

	res.status(StatusCodes.OK).json({
		message: 'Budget deleted successfully',
	});
});

exports.getAmountByMajorHeadAndPeriodAndSubHead = catchAsync(
	async (req, res) => {
		const { major_head_id, period_id, subhead_id } = req.params;
		logger.info('Sanctioned Amount Controller', {
			major_head_id,
			period_id,
			subhead_id,
		});
		const data = await budgetService.getAmountByMajorHeadAndPeriodAndSubHead(
			major_head_id,
			period_id,
			subhead_id,
		);

		res.status(StatusCodes.OK).json({
			message: 'Sanctioned amount fetched successfully',
			data,
		});
	},
);

exports.approveBudget = catchAsync(async (req, res) => {
	const { ids } = req.body;
	const data = await budgetService.approveBudget(ids);

	res.status(StatusCodes.OK).json({
		message: 'Budgets approved successfully',
		data,
	});
});

exports.getAllApprovedBudgets = catchAsync(async (req, res) => {
	const data = await budgetService.getAllApprovedBudgets(req);

	res.status(StatusCodes.OK).json({ data });
});

exports.downloadBudgetReport = catchAsync(async (req, res) => {
	const data = await budgetService.getAllBudgets(req);

	if (!data.rows || data.rows.length == 0) {
		return res
			.status(StatusCodes.NO_CONTENT)
			.json({ message: 'Budget data is not available' });
	}

	const workbook = await budgetReportService.generateExcel(data);
	console.log('workbook ', workbook);
	// 👉 Headers set karo
	res.setHeader(
		'Content-Type',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	);

	res.setHeader('Content-Disposition', 'attachment; filename=budget.xlsx');

	// 👉 Direct response me bhejo
	await workbook.xlsx.write(res);

	res.end();
});
