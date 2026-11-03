'use strict';

const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approver'];

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('issues', {
			id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
			org_id: { type: Sequelize.INTEGER, allowNull: true },
			project_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'projects', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'RESTRICT',
			},
			title: { type: Sequelize.STRING(255), allowNull: false },
			description: { type: Sequelize.TEXT('long'), allowNull: true },
			priority: {
				type: Sequelize.ENUM('low', 'medium', 'high'),
				allowNull: false,
				defaultValue: 'medium',
			},
			issue_status: {
				type: Sequelize.ENUM('open', 'in_progress', 'resolved', 'closed'),
				allowNull: false,
				defaultValue: 'open',
			},
			// user ids: indexed, no foreign key (same style as created_by elsewhere)
			reporter_id: { type: Sequelize.INTEGER, allowNull: true },
			assignee_id: { type: Sequelize.INTEGER, allowNull: true },
			updated_by: { type: Sequelize.INTEGER, allowNull: true },
			createdAt: { type: Sequelize.DATE, allowNull: false },
			updatedAt: { type: Sequelize.DATE, allowNull: false },
		});
		await queryInterface.addIndex('issues', ['org_id'], { name: 'issues_org_idx' });
		await queryInterface.addIndex('issues', ['project_id'], { name: 'issues_project_idx' });
		await queryInterface.addIndex('issues', ['assignee_id'], { name: 'issues_assignee_idx' });
		await queryInterface.addIndex('issues', ['issue_status'], { name: 'issues_status_idx' });

		// Sidebar menu and its six permissions
		const now = new Date();
		await queryInterface.bulkInsert('Menus', [{
			parentId: null,
			menuName: 'Issues',
			slug: 'issue',
			icon: 'IconClipboardList',
			url: '/issue',
			isActive: 1,
			showInSidebar: true,
			createdAt: now,
			updatedAt: now,
		}]);
		const [menu] = await queryInterface.sequelize.query(
			'SELECT id FROM Menus WHERE slug = :slug LIMIT 1',
			{ type: Sequelize.QueryTypes.SELECT, replacements: { slug: 'issue' } },
		);
		await queryInterface.bulkInsert('Permissions',
			ACTIONS.map((action) => ({ menu_id: menu.id, action, createdAt: now, updatedAt: now })));
	},

	async down(queryInterface) {
		await queryInterface.sequelize.query(
			`DELETE rp FROM role_permissions rp
			 JOIN Permissions p ON p.id = rp.permission_id
			 JOIN Menus mn ON mn.id = p.menu_id WHERE mn.slug = :slug`,
			{ replacements: { slug: 'issue' } });
		await queryInterface.sequelize.query(
			'DELETE p FROM Permissions p JOIN Menus mn ON mn.id = p.menu_id WHERE mn.slug = :slug',
			{ replacements: { slug: 'issue' } });
		await queryInterface.sequelize.query(
			'DELETE FROM Menus WHERE slug = :slug', { replacements: { slug: 'issue' } });
		await queryInterface.dropTable('issues');
	},
};