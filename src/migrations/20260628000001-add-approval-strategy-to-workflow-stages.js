'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('workflow_stages', 'approval_strategy', {
			type: Sequelize.ENUM('single', 'any_one', 'all_required', 'min_count'),
			allowNull: false,
			defaultValue: 'single',
		});
		await queryInterface.addColumn('workflow_stages', 'min_approvals', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});
		await queryInterface.addColumn('workflow_stages', 'skip_condition_field', {
			type: Sequelize.STRING(50),
			allowNull: true,
		});
		await queryInterface.addColumn('workflow_stages', 'skip_condition_operator', {
			type: Sequelize.ENUM('gte', 'lte', 'eq', 'between'),
			allowNull: true,
		});
		await queryInterface.addColumn('workflow_stages', 'skip_condition_value', {
			type: Sequelize.STRING(255),
			allowNull: true,
		});
		await queryInterface.addColumn('workflow_stages', 'skip_condition_value_to', {
			type: Sequelize.STRING(255),
			allowNull: true,
		});
	},
	async down(queryInterface) {
		await queryInterface.removeColumn('workflow_stages', 'approval_strategy');
		await queryInterface.removeColumn('workflow_stages', 'min_approvals');
		await queryInterface.removeColumn('workflow_stages', 'skip_condition_field');
		await queryInterface.removeColumn('workflow_stages', 'skip_condition_operator');
		await queryInterface.removeColumn('workflow_stages', 'skip_condition_value');
		await queryInterface.removeColumn('workflow_stages', 'skip_condition_value_to');
	},
};
