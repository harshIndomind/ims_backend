'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.removeConstraint('departments', 'name');

		await queryInterface.changeColumn('departments', 'name', {
			type: Sequelize.STRING(100),
			allowNull: true,
		});
		await queryInterface.addColumn('departments', 'depCd', {
			type: Sequelize.STRING(20),
			allowNull: true,
		});
		await queryInterface.addColumn('departments', 'depName', {
			type: Sequelize.STRING(100),
			allowNull: true,
		});
		await queryInterface.addColumn('departments', 'unitCd', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});
		await queryInterface.addColumn('departments', 'unit_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: {
				model: 'MasterUnits',
				key: 'id',
			},
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('departments', 'depCd');
		await queryInterface.removeColumn('departments', 'depName');
		await queryInterface.removeColumn('departments', 'unitCd');
		await queryInterface.removeColumn('departments', 'unit_id');
		await queryInterface.changeColumn('departments', 'name', {
			type: Sequelize.STRING(100),
			allowNull: false,
			unique: true,
		});
	},
};
