'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('designations', 'desCd', {
			type: Sequelize.INTEGER,
			allowNull: true,
			defaultValue: 0,
		});
		await queryInterface.addColumn('designations', 'desName', {
			type: Sequelize.STRING(100),
			allowNull: true,
		});
		await queryInterface.addColumn('designations', 'lock', {
			type: Sequelize.INTEGER,
			allowNull: true,
			defaultValue: 0,
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('designations', 'desCd');
		await queryInterface.removeColumn('designations', 'desName');
		await queryInterface.removeColumn('designations', 'lock');
	},
};
