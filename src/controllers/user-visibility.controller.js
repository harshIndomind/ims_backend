const catchAsync = require('../utils/catchAsync');
const userVisibilityService = require('../services/userVisibility.service');

exports.getMyVisibility = catchAsync(async (req, res) => {
	const data = await userVisibilityService.getMyVisibility(req.user);
	res.status(200).json({ status: 'success', data });
});

exports.getVisibility = catchAsync(async (req, res) => {
	const userId = Number(req.params.id);
	const data = await userVisibilityService.getVisibilityTree(userId, req.user.org_id);
	res.status(200).json({ status: 'success', data });
});

exports.saveVisibility = catchAsync(async (req, res) => {
	const userId = Number(req.params.id);
	const { mappings } = req.body;
	await userVisibilityService.saveVisibility(userId, mappings, req.user.org_id, req.user.id);
	res.status(200).json({ status: 'success', message: 'Visibility mappings saved successfully' });
});
