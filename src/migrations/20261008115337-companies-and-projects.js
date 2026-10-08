'use strict';

const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approver'];
const MENUS = [
	{ menuName: 'Companies', slug: 'company', url: '/company', icon: 'IconBuildings' },
	{ menuName: 'Projects', slug: 'project', url: '/project', icon: 'Briefcase' },
];

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('companies', {
			id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
			org_id: { type: Sequelize.INTEGER, allowNull: true },
			name: { type: Sequelize.STRING(255), allowNull: false },
			description: { type: Sequelize.TEXT, allowNull: true },
			address: { type: Sequelize.TEXT, allowNull: true },
			contact_no: { type: Sequelize.STRING(20), allowNull: true },
			alt_contact_no: { type: Sequelize.STRING(20), allowNull: true },
			is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
			created_by: { type: Sequelize.INTEGER, allowNull: true },
			updated_by: { type: Sequelize.INTEGER, allowNull: true },
			createdAt: { type: Sequelize.DATE, allowNull: false },
			updatedAt: { type: Sequelize.DATE, allowNull: false },
		});
		await queryInterface.addIndex('companies', ['org_id'], { name: 'companies_org_idx' });

		await queryInterface.createTable('projects', {
			id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
			org_id: { type: Sequelize.INTEGER, allowNull: true },
			company_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'companies', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'RESTRICT',
			},
			name: { type: Sequelize.STRING(255), allowNull: false },
			description: { type: Sequelize.TEXT, allowNull: true },
			status: {
				type: Sequelize.ENUM('not_started', 'in_progress', 'completed'),
				allowNull: false,
				defaultValue: 'not_started',
			},
			start_date: { type: Sequelize.DATEONLY, allowNull: false },
			end_date: { type: Sequelize.DATEONLY, allowNull: true },
			is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
			created_by: { type: Sequelize.INTEGER, allowNull: true },
			updated_by: { type: Sequelize.INTEGER, allowNull: true },
			createdAt: { type: Sequelize.DATE, allowNull: false },
			updatedAt: { type: Sequelize.DATE, allowNull: false },
		});
		await queryInterface.addIndex('projects', ['org_id'], { name: 'projects_org_idx' });
		await queryInterface.addIndex('projects', ['company_id'], { name: 'projects_company_idx' });

		// Sidebar menus, each with its six permissions
		const now = new Date();
		for (const m of MENUS) {
			await queryInterface.bulkInsert('Menus', [{
				parentId: null,
				menuName: m.menuName,
				slug: m.slug,
				icon: m.icon,
				url: m.url,
				isActive: 1,
				showInSidebar: true,
				createdAt: now,
				updatedAt: now,
			}]);
			const [menu] = await queryInterface.sequelize.query(
				'SELECT id FROM Menus WHERE slug = :slug LIMIT 1',
				{ type: Sequelize.QueryTypes.SELECT, replacements: { slug: m.slug } },
			);
			await queryInterface.bulkInsert('Permissions',
				ACTIONS.map((action) => ({ menu_id: menu.id, action, createdAt: now, updatedAt: now })));
		}
	},

	async down(queryInterface) {
		for (const m of MENUS) {
			await queryInterface.sequelize.query(
				`DELETE rp FROM role_permissions rp
				 JOIN Permissions p ON p.id = rp.permission_id
				 JOIN Menus mn ON mn.id = p.menu_id WHERE mn.slug = :slug`,
				{ replacements: { slug: m.slug } });
			await queryInterface.sequelize.query(
				'DELETE p FROM Permissions p JOIN Menus mn ON mn.id = p.menu_id WHERE mn.slug = :slug',
				{ replacements: { slug: m.slug } });
			await queryInterface.sequelize.query(
				'DELETE FROM Menus WHERE slug = :slug', { replacements: { slug: m.slug } });
		}
		await queryInterface.dropTable('projects');
		await queryInterface.dropTable('companies');
	},
};