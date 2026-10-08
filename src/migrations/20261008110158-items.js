'use strict';

const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approver'];

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('items', {
			id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
			org_id: { type: Sequelize.INTEGER, allowNull: true },
			item_code: { type: Sequelize.STRING(50), allowNull: false },
			item_name: { type: Sequelize.STRING(255), allowNull: false },
			description: { type: Sequelize.TEXT, allowNull: true },
			unit: { type: Sequelize.STRING(30), allowNull: true },
			status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'draft' },
			is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
			created_by: { type: Sequelize.INTEGER, allowNull: true },
			updated_by: { type: Sequelize.INTEGER, allowNull: true },
			createdAt: { type: Sequelize.DATE, allowNull: false },
			updatedAt: { type: Sequelize.DATE, allowNull: false },
		});
		await queryInterface.addIndex('items', ['org_id', 'item_code'], {
			unique: true,
			name: 'items_org_code_unique',
		});

		// Sidebar menu under "Masters"
		const q = { type: Sequelize.QueryTypes.SELECT };
		const [parent] = await queryInterface.sequelize.query(
			"SELECT id FROM Menus WHERE slug = 'masters' LIMIT 1", q);
		const now = new Date();
		await queryInterface.bulkInsert('Menus', [{
			parentId: parent ? parent.id : null,
			menuName: 'Items',
			slug: 'items',
			icon: null,
			url: '/masters/items',
			isActive: 1,
			showInSidebar: true,
			createdAt: now,
			updatedAt: now,
		}]);

		// The six permissions for this menu
		const [menu] = await queryInterface.sequelize.query(
			"SELECT id FROM Menus WHERE slug = 'items' LIMIT 1", q);
		await queryInterface.bulkInsert('Permissions',
			ACTIONS.map((action) => ({ menu_id: menu.id, action, createdAt: now, updatedAt: now })));
	},

	async down(queryInterface) {
		await queryInterface.sequelize.query(
			`DELETE rp FROM role_permissions rp
			 JOIN Permissions p ON p.id = rp.permission_id
			 JOIN Menus m ON m.id = p.menu_id WHERE m.slug = 'items'`);
		await queryInterface.sequelize.query(
			`DELETE p FROM Permissions p JOIN Menus m ON m.id = p.menu_id WHERE m.slug = 'items'`);
		await queryInterface.sequelize.query("DELETE FROM Menus WHERE slug = 'items'");
		await queryInterface.dropTable('items');
	},
};