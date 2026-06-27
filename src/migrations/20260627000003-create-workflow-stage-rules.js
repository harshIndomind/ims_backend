'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('workflow_stage_rules', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			workflow_stage_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'workflow_stages', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			rule_type: {
				type: Sequelize.ENUM('role', 'user', 'department_role', 'store_role'),
				allowNull: false,
			},
			role_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'Roles', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			user_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'Users', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			condition_field: {
				type: Sequelize.STRING(50),
				allowNull: true,
			},
			condition_operator: {
				type: Sequelize.ENUM('gte', 'lte', 'eq', 'between'),
				allowNull: true,
			},
			condition_value: {
				type: Sequelize.STRING(255),
				allowNull: true,
			},
			condition_value_to: {
				type: Sequelize.STRING(255),
				allowNull: true,
			},
			match_mode: {
				type: Sequelize.ENUM('any', 'all'),
				allowNull: false,
				defaultValue: 'any',
			},
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
			updatedAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
		});

		await queryInterface.addIndex('workflow_stage_rules', ['workflow_stage_id']);
	},
	async down(queryInterface) {
		await queryInterface.dropTable('workflow_stage_rules');
	},
};
