const { MenuRepository } = require('../repository/index');

class MenuService {
	constructor() {
		this.menuRepo = new MenuRepository();
	}

	async create(data) {
		try {
			const menu = await this.menuRepo.create(data);
			return menu;
		} catch (error) {
			console.error('ERROR: Something went wrong in service layer');
			throw error;
		}
	}

	async getMenus(roleId) {
		try {
			const menus = await this.menuRepo.getMenus(roleId);
			return menus;
		} catch (error) {
			console.error('ERROR: Something went wrong in service layer');
			throw error;
		}
	}

	async getParentMenus() {
		try {
			const menus = await this.menuRepo.getParentMenus();
			return menus;
		} catch (error) {
			console.error('ERROR: Something went wrong in service layer');
			throw error;
		}
	}

	async getMenuById(id) {
		try {
			const menus = await this.menuRepo.getMenuById(id);
			return menus;
		} catch (error) {
			console.error('ERROR: Something went wrong in service layer');
			throw error;
		}
	}

	async update(id, data) {
		try {
			const menu = await this.menuRepo.update(id, data);
			return menu;
		} catch (error) {
			console.error('ERROR: Something went wrong in service layer');
			throw error;
		}
	}

	async delete(id) {
		try {
			const menu = await this.menuRepo.delete(id);
			return menu;
		} catch (error) {
			console.error('ERROR: Something went wrong in service layer');
			throw error;
		}
	}
}

module.exports = MenuService;
