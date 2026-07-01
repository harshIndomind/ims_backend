'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('workflow_definitions', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'organizations', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			document_type: {
				type: Sequelize.STRING(50),
				allowNull: false,
			},
			name: {
				type: Sequelize.STRING(150),
				allowNull: false,
			},
			description: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			is_active: {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: true,
			},
			is_default: {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},
			version: {
				type: Sequelize.INTEGER,
				allowNull: false,
				defaultValue: 1,
			},
			lock_stage_sequence: {
				type: Sequelize.INTEGER,
				allowNull: false,
				defaultValue: 1,
			},
			restart_on_edit_after_rejection: {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: true,
			},
			createdBy: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			updatedBy: {
				type: Sequelize.JSON,
				allowNull: true,
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

		await queryInterface.addIndex('workflow_definitions', ['document_type', 'org_id', 'is_active']);
	},
	async down(queryInterface) {
		await queryInterface.dropTable('workflow_definitions');
	},
};
