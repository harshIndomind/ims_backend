'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('IssueHistories', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			issueId: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'Issues',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			changedById: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'Users', // your user table
					key: 'id',
				},
			},
			oldStatus: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			newStatus: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			changedAt: {
				type: Sequelize.DATE,
				defaultValue: Sequelize.NOW,
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
		await queryInterface.dropTable('IssueHistories');
	},
};
