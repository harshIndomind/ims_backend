'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('workflow_actions', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			workflow_instance_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'workflow_instances', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			workflow_stage_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'workflow_stages', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			},
			action: {
				type: Sequelize.ENUM(
					'submitted',
					'verified',
					'approved',
					'rejected',
					'cancelled',
					'skipped',
					'resubmitted',
					'edited',
					'reopened',
				),
				allowNull: false,
			},
			performed_by: {
				type: Sequelize.JSON,
				allowNull: false,
			},
			performed_by_role: {
				type: Sequelize.STRING(150),
				allowNull: true,
			},
			remarks: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			metadata: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
		});

		await queryInterface.addIndex('workflow_actions', ['workflow_instance_id', 'createdAt']);
	},
	async down(queryInterface) {
		await queryInterface.dropTable('workflow_actions');
	},
};
