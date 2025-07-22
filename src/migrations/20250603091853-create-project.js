'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('Projects', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			company_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			name: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			description: {
				type: Sequelize.TEXT,
				allowNull: false,
			},
			status: {
				type: Sequelize.ENUM('not_started', 'in_progress', 'completed'),
				defaultValue: 'not_started',
				allowNull: false,
			},
			startDate: {
				type: Sequelize.DATE,
				allowNull: false,
			},
			endDate: {
				type: Sequelize.DATE,
			},
			createdBy: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'Users', key: 'id' },
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
		await queryInterface.dropTable('Projects');
	},
};
