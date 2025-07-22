const { Permission, Menu } = require('../models/index');
class PermissionRepository {
	async create(data) {
		try {
			// Destructure to extract menuId separately
			const { menuId, ...permissionData } = data;

			// Step 1: Create permission
			const permission = await Permission.create(permissionData);

			// Step 2: Link it to menu via pivot table
			if (menuId) {
				await permission.addMenu(menuId); // this inserts into menu_permissions
			}

			return permission;
		} catch (error) {
			throw error;
		}
	}

	async update(id, data) {
		try {
			const [affectedCount] = await Permission.update(data, { where: { id } });

			return affectedCount;
		} catch (error) {
			throw error;
		}
	}
	async delete(id) {
		try {
			const role = await Permission.destroy({ where: { id } });
			return role;
		} catch (error) {
			throw error;
		}
	}
	async allPermissions() {
		try {
			const roles = await Permission.findAll({
				include: { model: Menu, as: 'menu' },
			});
			return roles;
		} catch (error) {
			throw error;
		}
	}
	async permissionById(id) {
		try {
			const role = await Permission.findByPk(id, {
				include: { model: Menu, as: 'menu' },
			});

			return role;
		} catch (error) {
			throw error;
		}
	}
}

module.exports = PermissionRepository;
