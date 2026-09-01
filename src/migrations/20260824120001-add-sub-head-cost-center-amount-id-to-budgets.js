'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('Budgets', 'sub_head_cost_center_amount_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: {
				model: 'MasterSubHeadCostCenterAmounts',
				key: 'id',
			},
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
		});
	},
	async down(queryInterface) {
		await queryInterface.removeColumn('Budgets', 'sub_head_cost_center_amount_id');
	},
};
