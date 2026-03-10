const { Menu, Permission, Role, RolesPermissions } = require('../models/index');
const { Op } = require('sequelize');

class MenuRespository {
	async create(data) {
		try {
			const menu = await Menu.create(data);
			return menu;
		} catch (error) {
			console.log('Something Went Wrong In Menu Repository Layer');
			throw error;
		}
	}

	async update(id, data) {
		try {
			const [affectedCount] = await Menu.update(data, { where: { id } });
			return affectedCount;
		} catch (error) {
			console.log('Something Went Wrong In Menu Repository Layer');
			throw error;
		}
	}

	// async getMenus() {
	// 	try {
	// 		const menus = await Menu.findAll({
	// 			where: { parentId: null },
	// 			attributes: {
	// 				exclude: ['isActive'],
	// 				include: ['id', ['menuName', 'title'], 'icon'],
	// 			},
	// 			include: [
	// 				{
	// 					model: Menu,
	// 					as: 'children',
	// 					attributes: {
	// 						exclude: ['isActive'],
	// 						include: ['id', ['menuName', 'title'], 'icon'],
	// 					},
	// 				},
	// 			],
	// 		});
	// 		return menus;
	// 	} catch (error) {
	// 		console.log('Something Went Wrong In Menu Repository Layer');
	// 		throw error;
	// 	}
	// }

	async getMainMenuByRoleId(roleId) {
		const roleData = await Role.findByPk(roleId, { attributes: ['name'] });

		if (!roleData) return [];

		const menusByRole = {
			Admin: [
				'Dashboard',
				'Companies',
				'Projects',
				'Issues',
				'Users',
				'Menu',
				'Permissions',
				'Roles Permissions',
			],
			'Project Tech Head': ['Dashboard', 'Issues'],
			User: ['Dashboard', 'Issues'],
			'Support Engineer': ['Dashboard', 'Issues'],
		};

		return menusByRole[roleData.name] || [];
	}

	// async getMenus(roleId) {
	// 	try {
	// 		const role = await Role.findByPk(roleId);
	// 		if (!role) throw new Error('Invalid Role ID');

	// 		// ✅ If Admin, return all menus without filtering
	// 		if (role.name === 'Admin') {
	// 			const allMenus = await Menu.findAll({
	// 				where: { parentId: null },
	// 				attributes: ['id', 'menuName', ['menuName', 'title'], 'icon', 'url'],
	// 				include: [
	// 					{
	// 						model: Menu,
	// 						as: 'children',
	// 						attributes: [
	// 							'id',
	// 							'menuName',
	// 							['menuName', 'title'],
	// 							'icon',
	// 							'url',
	// 						],
	// 					},
	// 				],
	// 			});

	// 			// Convert to plain object (optional if frontend wants pure JSON)
	// 			return allMenus.map((menu) => menu.toJSON());
	// 		}

	// 		// 🔐 For other roles, return permission-based menus
	// 		const menus = await Menu.findAll({
	// 			where: { parentId: null },
	// 			attributes: ['id', 'menuName', ['menuName', 'title'], 'icon', 'url'],
	// 			include: [
	// 				{
	// 					model: Menu,
	// 					as: 'children',
	// 					attributes: [
	// 						'id',
	// 						'menuName',
	// 						['menuName', 'title'],
	// 						'icon',
	// 						'url',
	// 					],
	// 					include: [
	// 						{
	// 							model: Permission,
	// 							as: 'permissions',
	// 							attributes: ['id', 'permission'],
	// 							include: [
	// 								{
	// 									model: Role,
	// 									as: 'roles',
	// 									where: { id: roleId },
	// 									attributes: [],
	// 									through: { attributes: [] },
	// 									required: true, // ✅ Ensure only permissions matching the role
	// 								},
	// 							],
	// 						},
	// 					],
	// 				},
	// 				{
	// 					model: Permission,
	// 					as: 'permissions',
	// 					attributes: ['id', 'permission'],
	// 					include: [
	// 						{
	// 							model: Role,
	// 							as: 'roles',
	// 							where: { id: roleId },
	// 							attributes: [],
	// 							through: { attributes: [] },
	// 							required: true,
	// 						},
	// 					],
	// 				},
	// 			],
	// 		});

	// 		// Filter only permitted parent or children menus
	// 		const filteredMenus = menus
	// 			.map((menu) => {
	// 				const menuJson = menu.toJSON();

	// 				const permittedChildren =
	// 					menuJson.children?.filter(
	// 						(child) => child.permissions && child.permissions.length > 0
	// 					) || [];

	// 				const isParentPermitted = menuJson.permissions?.length > 0;

	// 				if (isParentPermitted || permittedChildren.length > 0) {
	// 					return {
	// 						...menuJson,
	// 						children: permittedChildren,
	// 					};
	// 				}

	// 				return null;
	// 			})
	// 			.filter(Boolean); // Remove nulls

	// 		return filteredMenus;
	// 	} catch (error) {
	// 		console.error('Something Went Wrong In Menu Repository Layer:', error);
	// 		throw error;
	// 	}
	// }

	async getMenus(roleId) {
		try {
			const role = await Role.findByPk(roleId);
			if (!role) throw new Error('Invalid Role ID');

			// ✅ Admin sees all menus
			if (role.name === 'Super Admin') {
				const allMenus = await Menu.findAll({
					where: { parentId: null, isActive: 1 },
					attributes: ['id', 'menuName', ['menuName', 'title'], 'icon', 'url'],
					include: [
						{
							model: Menu,
							as: 'children',
							attributes: [
								'id',
								'menuName',
								['menuName', 'title'],
								'icon',
								'url',
							],
						},
					],
				});
				return allMenus.map((menu) => menu.toJSON());

				// return this.buildTree(await Menu.findAll());
			}

			// ✅ For other roles, fetch only menus linked to role
			const permittedMenus = await Menu.findAll({
				where: { parentId: null, isActive: 1 },
				attributes: ['id', 'menuName', ['menuName', 'title'], 'icon', 'url'],
				include: [
					{
						model: Menu,
						as: 'children',
						attributes: [
							'id',
							'menuName',
							['menuName', 'title'],
							'icon',
							'url',
						],
						include: [
							{
								model: Role,
								as: 'roles',
								where: { id: roleId },
								attributes: [],
								through: { attributes: [] },
								required: true,
							},
						],
					},
					{
						model: Role,
						as: 'roles',
						where: { id: roleId },
						attributes: [],
						through: { attributes: [] },
						required: true,
					},
				],
			});

			// ✅ Filter out parent menus with no permitted children or self
			const filteredMenus = permittedMenus
				.map((menu) => {
					const menuJson = menu.toJSON();
					const hasChild = menuJson.children?.length > 0;

					if (!hasChild) {
						return menuJson.url === '' ? null : menuJson;
					}

					return hasChild || menuJson ? menuJson : null;
				})
				.filter(Boolean);

			return filteredMenus;
		} catch (error) {
			console.error('Menu Fetch Error:', error);
			throw error;
		}
	}

	async buildTree(list) {
		const map = {};
		const roots = [];

		list.forEach(
			(item) => (map[item.id] = { ...item.dataValues, children: [] }),
		);

		list.forEach((item) => {
			if (item.parentId) {
				map[item.parentId].children.push(map[item.id]);
			} else {
				roots.push(map[item.id]);
			}
		});

		return roots;
	}

	async getParentMenus() {
		try {
			const menus = await Menu.findAll({
				// where: {
				// 	parentId: {
				// 		[Op.eq]: null,
				// 	},
				// },
			});
			return menus;
		} catch (error) {
			console.log('Something Went Wrong In Menu Repository Layer');
			throw error;
		}
	}

	async getMenuById(id) {
		try {
			const menu = await Menu.findOne({ where: { id } });
			return menu;
		} catch (error) {
			console.log('Something Went Wrong In Menu Repository Layer');
			throw error;
		}
	}

	async delete(id) {
		try {
			const menu = await Menu.destroy({ where: { id } });
			return menu;
		} catch (error) {
			console.log('Something Went Wrong In Menu Repository Layer');
			throw error;
		}
	}
}



module.exports = MenuRespository;
