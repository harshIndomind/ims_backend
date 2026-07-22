'use strict';

const LEVEL_MAP = {
	super_admin: 0,
	org_admin: 1,
	app_admin: 2,
};

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('Roles', 'level', {
			type: Sequelize.INTEGER,
			allowNull: false,
			defaultValue: 3,
		});

		for (const [code, level] of Object.entries(LEVEL_MAP)) {
			await queryInterface.sequelize.query(
				`UPDATE Roles SET level = ${level} WHERE code = '${code}'`,
			);
		}
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('Roles', 'level');
	},
};
