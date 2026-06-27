'use strict';

const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');

const DEFAULT_PASSWORD = '12345678';
const ORG_ID = 1;
const USER = { name: 'Indent Approver', email: 'indent.approver@email.com', role_code: 'indent_approver' };

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface) {
		const [role] = await queryInterface.sequelize.query(
			`SELECT id FROM Roles WHERE code = :code`,
			{ replacements: { code: USER.role_code }, type: queryInterface.sequelize.QueryTypes.SELECT },
		);
		if (!role) throw new Error(`Role '${USER.role_code}' not found — run role seeder first`);

		const existing = await queryInterface.sequelize.query(
			`SELECT id FROM Users WHERE email = :email`,
			{ replacements: { email: USER.email }, type: queryInterface.sequelize.QueryTypes.SELECT },
		);
		if (existing.length) return;

		const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

		await queryInterface.bulkInsert('Users', [
			{
				uuid: randomUUID(),
				org_id: ORG_ID,
				name: USER.name,
				email: USER.email,
				password: hashedPassword,
				roleId: role.id,
				is_active: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		const [user] = await queryInterface.sequelize.query(
			`SELECT id FROM Users WHERE email = :email`,
			{ replacements: { email: USER.email }, type: queryInterface.sequelize.QueryTypes.SELECT },
		);

		await queryInterface.bulkInsert('user_roles', [
			{ user_id: user.id, role_id: role.id, assigned_at: new Date() },
		]);
	},

	async down(queryInterface) {
		await queryInterface.bulkDelete('Users', { email: USER.email });
	},
};
