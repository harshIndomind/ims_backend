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

exports.verifyIndent = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { items } = req.body;
	const data = await indentService.verifyIndent(req, id, items);

	res.status(StatusCodes.OK).json({
		message: 'Indent verified successfully',
		data,
	});
});

exports.approveIndent = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { items, last_date } = req.body;
	const data = await indentService.approveIndent(req, id, items, last_date);

	res.status(StatusCodes.OK).json({
		message: 'Indent approved successfully',
		data,
	});
});

exports.previewReissue = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await indentService.previewReissue(req, id);

	res.status(StatusCodes.OK).json({
		message: 'Re-issue availability previewed successfully',
		data,
	});
});

exports.reissueIndent = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await indentService.reissuePendingQuantity(req, id);

	res.status(StatusCodes.OK).json({
		message: 'Indent re-issue checked successfully',
		data,
	});
});

exports.rejectIndent = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await indentService.rejectIndent(req, id, remarks);

	res.status(StatusCodes.OK).json({
		message: 'Indent rejected successfully',
		data,
	});
});

exports.cancelIndent = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await indentService.cancelIndent(req, id, remarks);

	res.status(StatusCodes.OK).json({
		message: 'Indent cancelled successfully',
		data,
	});
});

exports.reopenIndent = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await indentService.reopenIndent(req, id, remarks);

	res.status(StatusCodes.OK).json({
		message: 'Indent reopened successfully',
		data,
	});
});

exports.archiveIndent = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await indentService.archiveIndent(req, id, remarks);

	res.status(StatusCodes.OK).json({
		message: 'Indent archived successfully',
		data,
	});
});

exports.restoreIndent = catchAsync(async (req, res) => {
	const { id } = req.params;
	const { remarks } = req.body;
	const data = await indentService.restoreIndent(req, id, remarks);

	res.status(StatusCodes.OK).json({
		message: 'Indent restored successfully',
		data,
	});
});

exports.updateIndent = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await indentService.updateIndent(req, id, req.body);

	res.status(StatusCodes.OK).json({
		message: 'Indent updated successfully',
		data,
	});
});

exports.getIndentById = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await indentService.getIndentById(req, id);

	res.status(StatusCodes.OK).json({
		message: 'Indent fetched successfully',
		data,
	});
});

exports.generateInvoiceHtml = catchAsync(async (req, res) => {
	const html = await indentService.generateInvoiceHtml(req);
	res.json({ html });
});

exports.downloadInvoicePdf = catchAsync(async (req, res) => {
	const pdfUrl = await indentService.downloadInvoicePdf(req);
	res.json({ pdfUrl });
});

exports.getIndentWorkflow = catchAsync(async (req, res) => {
	const { id } = req.params;
	const data = await indentService.getIndentWorkflow(req, id);

	res.status(StatusCodes.OK).json({
		message: 'Indent workflow fetched successfully',
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