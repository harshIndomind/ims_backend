const { MenuService } = require('../services/index');
const { Menu, Permission, sequelize } = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const { Op } = require('sequelize');
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

exports.getMenusWithPermissions = catchAsync(async (req, res) => {
	const { roles } = req.user;
	const isSuperAdmin = roles.includes('super_admin');

	// Build a permission ID filter for non-super-admin callers
	let permissionWhere = null;
	if (!isSuperAdmin) {
		const callerPerms = await sequelize.query(
			`SELECT DISTINCT rp.permission_id AS id
			 FROM user_roles ur
			 JOIN role_permissions rp ON rp.role_id = ur.role_id
			 WHERE ur.user_id = ?`,
			{ replacements: [req.user.id], type: sequelize.QueryTypes.SELECT },
		);

		if (!callerPerms.length) return res.json([]);

		const callerPermIds = callerPerms.map((r) => r.id);
		permissionWhere = { id: { [Op.in]: callerPermIds } };
	}

	const menus = await Menu.findAll({
		where: { parentId: null, isActive: 1 },
		attributes: ['id', 'menuName', 'slug'],
		include: [
			{
				model: Menu,
				as: 'children',
				where: { parentId: { [Op.ne]: null }, isActive: 1 },
				required: false,
				attributes: ['id', 'menuName', ['menuName', 'title'], 'icon', 'url'],
				include: [
					{
						model: Permission,
						as: 'permissions',
						attributes: ['id', 'action'],
						required: false,
						...(permissionWhere && { where: permissionWhere }),
					},
				],
			},
			{
				model: Permission,
				as: 'permissions',
				attributes: ['id', 'action'],
				required: false,
				...(permissionWhere && { where: permissionWhere }),
			},
		],
		order: [
			['menuName', 'ASC'],
			[{ model: Permission, as: 'permissions' }, 'action', 'ASC'],
		],
	});

	// For non-super-admins: strip menus where caller holds no permissions at all
	if (!isSuperAdmin) {
		const filtered = menus
			.map((m) => m.toJSON())
			.filter(
				(m) =>
					(m.permissions && m.permissions.length > 0) ||
					(m.children && m.children.some((c) => c.permissions && c.permissions.length > 0)),
			);
		return res.json(filtered);
	}

	res.json(menus);
});

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
