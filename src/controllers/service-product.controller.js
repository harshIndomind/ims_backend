const catchAsync = require('../utils/catchAsync');
const productUsageService = require('../services/service-product-usage.service');

exports.getProductUsage = catchAsync(async (req, res) => {
	const data = await productUsageService.getProductUsage(req.params.id);
	res.status(200).json({ success: true, data });
});
