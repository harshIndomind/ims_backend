'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('Issues', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			title: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			description: {
				type: Sequelize.TEXT,
				allowNull: false,
			},
			priority: {
				type: Sequelize.ENUM('low', 'medium', 'high'),
				defaultValue: 'medium',
				allowNull: false,
			},
			status: {
				type: Sequelize.ENUM('open', 'in_progress', 'resolved', 'closed'),
				defaultValue: 'open',
				allowNull: false,
			},
			projectId: {
				type: Sequelize.INTEGER,
				references: { model: 'Projects', key: 'id' },
				allowNull: false,
			},
			reporterId: {
				type: Sequelize.INTEGER,
				references: { model: 'Users', key: 'id' },
				allowNull: false,
			},
			assigneeId: {
				type: Sequelize.INTEGER,
				references: { model: 'Users', key: 'id' },
				allowNull: false,
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
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('Issues');
	},
};
