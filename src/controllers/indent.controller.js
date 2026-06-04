const path = require('path');
const fs = require('fs').promises;
const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const indentService = require('../services/indent.service');
const indentReportService = require('../services/indent-report.service');
const { BASE_URL } = require('../config/serverConfig');

exports.createIndent = catchAsync(async (req, res) => {
	console.log('data ', req.body);
	// return;
	const data = await indentService.createIndent(req, req.body);

	res.status(StatusCodes.CREATED).json({
		message: 'Indent created successfully',
		data,
	});
});

exports.getNextIndentId = catchAsync(async (req, res) => {
	const data = await indentService.getNextIndentId(req);

	res.status(StatusCodes.OK).json({
		message: 'Indent ID fetched successfully',
		data,
	});
});

exports.getAllIndents = catchAsync(async (req, res) => {
	const data = await indentService.getAllIndents(req);

	res.status(StatusCodes.OK).json({
		message: 'Indents fetched successfully',
		data,
	});
});

exports.exportIndents = catchAsync(async (req, res) => {
	const filePath = await indentService.exportIndents(req);

	res.status(StatusCodes.OK).json({
		message: 'Indents exported successfully',
		filePath,
	});
});

// exports.approveIndent = catchAsync(async (req, res) => {
//   const { ids } = req.body;
//   const data = await indentService.approveIndent(ids);

//   res.status(StatusCodes.OK).json({
//     message: 'Budgets approved successfully',
//     data,
//   });
// });

exports.checkProductQuantity = catchAsync(async (req, res) => {
	const { productId, uomId } = req.params;
	const data = await indentService.checkProductQuantity(req, productId, uomId);

	res.status(StatusCodes.OK).json({
		message: 'Product quantities checked successfully',
		data,
	});
});

exports.lastIndentByBudgetId = catchAsync(async (req, res) => {
	const { budget_id } = req.params;
	const data = await indentService.lastIndentByBudgetId(req, budget_id);

	res.status(StatusCodes.OK).json({
		message: 'Last indent fetched successfully',
		data,
	});
});

/**
 * [2026-06-03] getConsumedBudgetByBudgetId
 *
 * WHY: Added to support frontend budget-phase enforcement. Without this endpoint the
 * frontend had no way to know how much of the current phase budget was already consumed
 * by previously saved indents, allowing users to exceed the phase limit across multiple
 * separate indent creation sessions.
 *
 * Returns consumed_amount, consumed_qty, phase_amount, available_amount, phase_period.
 * The frontend shows "Available Budget" in the Budget Details card and blocks the user
 * from adding items that would exceed available_amount.
 */
exports.getConsumedBudgetByBudgetId = catchAsync(async (req, res) => {
	const { budget_id } = req.params;
	const data = await indentService.getConsumedBudgetByBudgetId(req, budget_id);

	res.status(StatusCodes.OK).json({
		message: 'Consumed budget fetched successfully',
		data,
	});
});

exports.verifyIndentQuantity = catchAsync(async (req, res) => {
	const { ids } = req.body;

	const data = await indentService.verifyIndentQuantity(req, ids);

	res.status(StatusCodes.OK).json({
		message: 'Verify the indent quantity before approval',
		data,
	});
});

exports.verifyAndApproveIndent = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { items } = req.body;
	console.log('verifyAndApproveIndent ', items);
	const data = await indentService.approveIndent(req, id, items);

	res.status(StatusCodes.OK).json({
		message: 'Indent approved successfully',
		data,
	});
});

exports.deleteIndent = catchAsync(async (req, res) => {
	const { id } = req.params;
	await indentService.deleteIndent(req, id);

	res.status(StatusCodes.OK).json({
		message: 'Indent deleted successfully',
	});
});

const INDENT_STORAGE_DIR = path.join(__dirname, '../../storage/indents');
const SAFE_INDENT_FILENAME_RE = /^indent_report_[\d_-]+\.xlsx$/;

exports.downloadIndentReport = catchAsync(async (req, res) => {
	const data = await indentService.getAllIndents(req);

	if (!data.rows || data.rows.length === 0) {
		return res
			.status(StatusCodes.NO_CONTENT)
			.json({ message: 'Indent data is not available' });
	}

	await fs.mkdir(INDENT_STORAGE_DIR, { recursive: true });

	const now = new Date();
	const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
	const fileName = `indent_report_${ts}.xlsx`;
	const filePath = path.join(INDENT_STORAGE_DIR, fileName);

	await indentReportService.generateExcel(data, filePath);

	const baseUrl = BASE_URL || 'http://localhost:4300';
	res.status(StatusCodes.OK).json({
		message: 'Indent report generated successfully',
		fileName,
		path: `${baseUrl}/storage/indents/${fileName}`,
	});
});

exports.cleanupIndentReport = catchAsync(async (req, res) => {
	const { name } = req.query;

	if (!name || !SAFE_INDENT_FILENAME_RE.test(name)) {
		return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid file name' });
	}

	const filePath = path.join(INDENT_STORAGE_DIR, name);
	await fs.unlink(filePath).catch(() => {});

	res.status(StatusCodes.OK).json({ message: 'Report file deleted' });
});