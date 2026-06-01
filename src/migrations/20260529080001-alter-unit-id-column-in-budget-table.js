'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.changeColumn('Budgets', 'unit_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});
		await queryInterface.addConstraint('Budgets', {
			fields: ['unit_id'],
			type: 'foreign key',
			name: 'Budgets_ibfk_unit_id',
			references: {
				table: 'MasterUnits',
				field: 'id',
			},
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeConstraint('Budgets', 'Budgets_ibfk_unit_id');
		await queryInterface.changeColumn('Budgets', 'unit_id', {
			type: Sequelize.STRING(50),
			allowNull: true,
		});
	},
};
