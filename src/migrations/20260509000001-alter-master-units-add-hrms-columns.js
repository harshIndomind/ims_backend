'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('MasterUnits', 'unitCd', {
			type: Sequelize.INTEGER,
			allowNull: true,
			defaultValue: 0,
		});
		await queryInterface.addColumn('MasterUnits', 'unitName', {
			type: Sequelize.STRING(100),
			allowNull: true,
		});
		await queryInterface.addColumn('MasterUnits', 'lock', {
			type: Sequelize.BOOLEAN,
			allowNull: true,
			defaultValue: false,
		});
		await queryInterface.addColumn('MasterUnits', 'masterUnitid', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('MasterUnits', 'unitCd');
		await queryInterface.removeColumn('MasterUnits', 'unitName');
		await queryInterface.removeColumn('MasterUnits', 'lock');
		await queryInterface.removeColumn('MasterUnits', 'masterUnitid');
	},
};
