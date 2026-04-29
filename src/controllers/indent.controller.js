const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const indentService = require('../services/indent.service');
const indentReportService = require('../services/indent-report.service');

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

exports.downloadIndentReport = catchAsync(async (req, res) => {
	const data = await indentService.getAllIndents(req);

	if (!data.rows || data.rows.length == 0) {
		return res
			.status(StatusCodes.NO_CONTENT)
			.json({ message: 'Indent data is not available' });
	}

	const workbook = await indentReportService.generateExcel(data);
	console.log('workbook ', workbook);
	// 👉 Headers set karo
	res.setHeader(
		'Content-Type',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	);

	res.setHeader('Content-Disposition', 'attachment; filename=indent.xlsx');

	// 👉 Direct response me bhejo
	await workbook.xlsx.write(res);

	res.end();
});