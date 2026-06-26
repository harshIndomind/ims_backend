'use strict';

const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');

const DEFAULT_PASSWORD = '12345678';
const ORG_ID = 1;

// SCM roles (see 20250603100742-RoleSeeder.js) that need a default user each
const USERS = [
	{ name: 'App Admin', email: 'app.admin@email.com', role_code: 'app_admin' },
	{
		name: 'Budget Entry',
		email: 'budget.entry@email.com',
		role_code: 'budget_entry',
	},
	{
		name: 'Budget Approver',
		email: 'budget.approver@email.com',
		role_code: 'budget_approver',
	},
	{
		name: 'Indent Creator',
		email: 'indent.creator@email.com',
		role_code: 'indent_creator',
	},
	{
		name: 'Indent Verifier',
		email: 'indent.verifier@email.com',
		role_code: 'indent_verifier',
	},
	{
		name: 'PR Creator',
		email: 'pr.creator@email.com',
		role_code: 'payment_requisition_creator',
	},
	{
		name: 'PR Approver',
		email: 'pr.approver@email.com',
		role_code: 'payment_requisition_approver',
	},
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface) {
		const roles = await queryInterface.sequelize.query(
			`SELECT id, code FROM Roles`,
			{ type: queryInterface.sequelize.QueryTypes.SELECT },
		);
		const roleMap = {};
		roles.forEach((r) => (roleMap[r.code] = r.id));

		const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

		for (const u of USERS) {
			const roleId = roleMap[u.role_code];
			if (!roleId)
				throw new Error(
					`Role '${u.role_code}' not found — run role seeder first`,
				);

			const existing = await queryInterface.sequelize.query(
				`SELECT id FROM Users WHERE email = :email`,
				{
					replacements: { email: u.email },
					type: queryInterface.sequelize.QueryTypes.SELECT,
				},
			);
			if (existing.length) {
				console.log(`⚠️  User ${u.email} already exists, skipping`);
				continue;
			}

			await queryInterface.bulkInsert('Users', [
				{
					uuid: randomUUID(),
					org_id: ORG_ID,
					name: u.name,
					email: u.email,
					password: hashedPassword,
					roleId,
					is_active: 1,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			]);

			const [user] = await queryInterface.sequelize.query(
				`SELECT id FROM Users WHERE email = :email`,
				{
					replacements: { email: u.email },
					type: queryInterface.sequelize.QueryTypes.SELECT,
				},
			);

			await queryInterface.bulkInsert('user_roles', [
				{
					user_id: user.id,
					role_id: roleId,
					assigned_at: new Date(),
				},
			]);

			console.log(`✅ Seeded user ${u.email} with role ${u.role_code}`);
		}
	},

	async down(queryInterface) {
		const emails = USERS.map((u) => u.email);
		await queryInterface.bulkDelete('Users', { email: emails });
	},
};
