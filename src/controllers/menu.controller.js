const { MenuService } = require('../services/index');
const { Menu, Permission } = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const { Op } = require('sequelize');
const { Console } = require('console');
const fetchPermissions = require('../helpers/fetchPermissions');
const logger = require('../utils/logger');
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

exports.getMenusS = catchAsync(async (req, res) => {
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

exports.getMenusWithPermissions = async (req, res) => {
	try {
		const menus = await Menu.findAll({
			where: {
				parentId: null,
				isActive: 1,
			},
			attributes: ['id', 'menuName', 'slug'],
			include: [
				{
					model: Menu,
					as: 'children',
					where: {
						parentId: { [Op.ne]: null },
						isActive: 1,
					},
					required: false,
					attributes: ['id', 'menuName', ['menuName', 'title'], 'icon', 'url'],
					include: [
						{
							model: Permission,
							as: 'permissions',
							attributes: ['id', 'action'],
							required: false,
						},
					],
				},
				{
					model: Permission,
					as: 'permissions',
					attributes: ['id', 'action'],
				},
			],
			order: [
				['menuName', 'ASC'], // Parent menu order
				// [{ model: Menu, as: 'children' }, 'menuName', 'ASC'], // Child menu order
				// [{ model: Menu, as: 'children' }, { model: Permission, as: 'permissions' }, 'action', 'ASC'], // Child permissions
				[{ model: Permission, as: 'permissions' }, 'action', 'ASC'], // Parent permissions
			],
		});

		res.json(menus);
	} catch (error) {
		console.error(error);
		res.status(500).json({
			message: 'Failed to load menus with permissions',
		});
	}
};

exports.getMenus = catchAsync(async (req, res) => {
	// async function getMenusForUser(req, res) {
	const { roles } = req.user;
	const permissions = await fetchPermissions(req);

	const allowedSlugs = new Set(
		(permissions ?? [])
			.map((p) => String(p))
			.filter((p) => p.split(':')[1] !== 'api_read')
			.map((p) => p.split(':')[0]),
	);
	const menus = await Menu.findAll({
		where: { isActive: 1, showInSidebar: true },
		attributes: [
			'id',
			'parentId',
			'menuName',
			['menuName', 'title'],
			'slug',
			'icon',
			'url',
			'showInSidebar',
		],
		order: [['id', 'ASC']],
	});

	const tree = buildMenuTree(menus, allowedSlugs, roles);

	res.status(200).json({
		status: true,
		message: 'Menu fetched successfully',
		data: tree,
	});
	// }
});

function buildMenuTree(menus, allowedSlugs, roles) {
	const map = {};
	const roots = [];

	// 1️⃣ Create map
	menus.forEach((menu) => {
		map[menu.id] = {
			...menu.toJSON(),
			children: [],
		};
	});

	// 2️⃣ Build hierarchy
	menus.forEach((menu) => {
		if (menu.parentId) {
			map[menu.parentId]?.children.push(map[menu.id]);
		} else {
			roots.push(map[menu.id]);
		}
	});

	// 3️⃣ Filter recursively
	function filterMenu(menu) {
		if (menu.showInSidebar === false) {
			return null;
		}

		if (roles.includes('super_admin')) {
			return menu;
		}

		if (menu.slug === 'dashboard') {
			return menu;
		}

		// ✅ LEAF menu (Dashboard, Major Head, etc.)
		if (menu.url) {
			return allowedSlugs.has(menu.slug) ? menu : null;
		}

		// ✅ PARENT menu
		const filteredChildren = menu.children.map(filterMenu).filter(Boolean);

		if (filteredChildren.length > 0) {
			return {
				...menu,
				children: filteredChildren,
			};
		}

		return null;
	}

	// 4️⃣ Final tree
	return roots.map(filterMenu).filter(Boolean);
}
