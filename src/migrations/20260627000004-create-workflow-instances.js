'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('workflow_instances', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'organizations', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			document_type: {
				type: Sequelize.STRING(50),
				allowNull: false,
			},
			document_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			workflow_definition_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'workflow_definitions', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			current_stage_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'workflow_stages', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			},
			status: {
				type: Sequelize.ENUM('draft', 'in_progress', 'approved', 'rejected', 'cancelled'),
				allowNull: false,
				defaultValue: 'draft',
			},
			started_at: {
				type: Sequelize.DATE,
				allowNull: true,
			},
			completed_at: {
				type: Sequelize.DATE,
				allowNull: true,
			},
			restart_count: {
				type: Sequelize.INTEGER,
				allowNull: false,
				defaultValue: 0,
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

		await queryInterface.addIndex('workflow_instances', ['document_type', 'document_id'], {
			unique: true,
			name: 'workflow_instances_document_unique',
		});
		await queryInterface.addIndex('workflow_instances', ['document_type', 'status']);
	},
	async down(queryInterface) {
		await queryInterface.dropTable('workflow_instances');
	},
};
