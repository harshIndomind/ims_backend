const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const indentService = require('../services/indent.service');

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
	const { limit, offset } = req.query;

	const options = {};
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset);
	}

	const data = await indentService.getAllIndents(options);

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
  const {id} = req.params;
	const { items } = req.body;
  console.log("verifyAndApproveIndent ", items)
	const data = await indentService.approveIndent(req, id, items);

	res.status(StatusCodes.OK).json({
		message: 'Indent approved successfully',
		data,
	});
});
