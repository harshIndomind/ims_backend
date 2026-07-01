'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('audit_logs', {
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
			entity_type: {
				type: Sequelize.STRING(50),
				allowNull: false,
			},
			entity_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			action: {
				type: Sequelize.STRING(50),
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
			previous_state: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			new_state: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			changed_data: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			remarks: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			ip_address: {
				type: Sequelize.STRING(64),
				allowNull: true,
			},
			user_agent: {
				type: Sequelize.STRING(255),
				allowNull: true,
			},
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
		});

		await queryInterface.addIndex('audit_logs', ['entity_type', 'entity_id', 'createdAt']);
	},
	async down(queryInterface) {
		await queryInterface.dropTable('audit_logs');
	},
};
