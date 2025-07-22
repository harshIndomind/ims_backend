const { MenuService } = require('../services/index');
const catchAsync = require('../utils/catchAsync');

const menuService = new MenuService();

exports.create = catchAsync(async (req, res) => {
	const { parentId, menuName, url, isActive, icon } = req.body;
	const menu = await menuService.create({
		parentId,
		menuName,
		icon,
		url,
		isActive,
	});

	res.status(201).json({
		status: true,
		message: 'Menu created successfully',
		data: menu,
	});
});

exports.update = catchAsync(async (req, res) => {
	const { parentId, menuName, url, isActive, icon } = req.body;
	const { id } = req.params;
	const menu = await menuService.update(id, {
		parentId,
		menuName,
		icon,
		url,
		isActive,
	});

	res.status(200).json({
		status: true,
		message: 'Menu updated successfully',
		data: menu,
	});
});

exports.getMenus = catchAsync(async (req, res) => {
	const roleId = req.user.roleId;
	const menus = await menuService.getMenus(roleId);
	res.status(200).json({
		status: true,
		message: 'Menu fetched successfully',
		data: menus,
	});
});

exports.getParentMenus = catchAsync(async (req, res) => {
	const menus = await menuService.getParentMenus();
	res.status(200).json({
		status: true,
		message: 'Parent menu fetched successfully',
		data: menus,
	});
});

exports.getMenuById = catchAsync(async (req, res) => {
	const { id } = req.params;

	const menu = await menuService.getMenuById(id);
	res.status(200).json({
		status: true,
		message: 'A Menu fetched successfully',
		data: menu,
	});
});

exports.delete = catchAsync(async (req, res) => {
	const { id } = req.params;
	const menu = await menuService.delete(id);
	res.status(200).json({
		status: true,
		message: 'Menu deleted successfully',
		data: menu,
	});
});
