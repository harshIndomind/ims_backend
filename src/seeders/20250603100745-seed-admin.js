'use strict';
const bcrypt = require('bcrypt');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		const password = await bcrypt.hash('1234', 10);
		await queryInterface.bulkInsert(
			'Users',
			[
				{
					name: 'Super Admin',
					email: 'superadmin@indomind.ai',
					password: password,
					roleId: 1,
					is_active: 1,
					swayamm_user_id: 1,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			],
			{},
		);

		const [role] = await queryInterface.sequelize.query(
			`SELECT id FROM Roles WHERE name = 'Super Admin'`,
			{ type: queryInterface.sequelize.QueryTypes.SELECT },
		);

		if (!role)
			throw new Error('Super Admin role not found — run role seeder first');

		// ── Step 4: Get newly created user id ─────────────────────
		const [user] = await queryInterface.sequelize.query(
			`SELECT id FROM Users WHERE email = 'superadmin@indomind.ai'`,
			{ type: queryInterface.sequelize.QueryTypes.SELECT },
		);

		// ── Step 5: Create user_roles entry ──────────────────────
		await queryInterface.bulkInsert('user_roles', [
			{
				user_id: user.id,
				role_id: role.id,
				assigned_at: new Date(),
			},
		]);

		console.log('✅ Superadmin seeded with super_admin role');
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.bulkDelete(
			'Users',
			{
				email: 'superadmin@indomind.ai', // safer rollback
			},
			{},
		);
	},
};
