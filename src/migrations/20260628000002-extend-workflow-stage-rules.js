'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		// MySQL ENUM column: extend in place via raw ALTER so existing rows ('role','user',
		// 'department_role','store_role') are untouched and no data migration is needed.
		await queryInterface.sequelize.query(
			"ALTER TABLE `workflow_stage_rules` MODIFY COLUMN `rule_type` ENUM('role','user','department_role','store_role','designation','organization','dynamic_resolver','reporting_manager','group') NOT NULL",
		);

		await queryInterface.addColumn('workflow_stage_rules', 'designation_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: { model: 'designations', key: 'id' },
			onUpdate: 'CASCADE',
			onDelete: 'CASCADE',
		});
		await queryInterface.addColumn('workflow_stage_rules', 'resolver_key', {
			type: Sequelize.STRING(100),
			allowNull: true,
		});
	},
	async down(queryInterface) {
		await queryInterface.removeColumn('workflow_stage_rules', 'designation_id');
		await queryInterface.removeColumn('workflow_stage_rules', 'resolver_key');
		await queryInterface.sequelize.query(
			"ALTER TABLE `workflow_stage_rules` MODIFY COLUMN `rule_type` ENUM('role','user','department_role','store_role') NOT NULL",
		);
	},
};
