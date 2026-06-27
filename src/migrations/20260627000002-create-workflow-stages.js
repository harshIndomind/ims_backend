'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('workflow_stages', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			workflow_definition_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'workflow_definitions', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			sequence: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			stage_key: {
				type: Sequelize.STRING(50),
				allowNull: false,
			},
			stage_name: {
				type: Sequelize.STRING(150),
				allowNull: false,
			},
			stage_type: {
				type: Sequelize.ENUM('maker', 'verification', 'approval', 'custom'),
				allowNull: false,
			},
			is_required: {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: true,
			},
			is_terminal_approval: {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},
			allow_edit_before: {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: true,
			},
			sla_hours: {
				type: Sequelize.INTEGER,
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

		await queryInterface.addIndex('workflow_stages', ['workflow_definition_id', 'sequence'], {
			unique: true,
			name: 'workflow_stages_definition_sequence_unique',
		});
		await queryInterface.addIndex('workflow_stages', ['workflow_definition_id', 'stage_key']);
	},
	async down(queryInterface) {
		await queryInterface.dropTable('workflow_stages');
	},
};
