'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('IssueAttachments', {
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
				onUpdate: 'CASCADE',
			},
			filename: { type: Sequelize.STRING, allowNull: false },
			path: { type: Sequelize.STRING, allowNull: false },
			fileType: { type: Sequelize.STRING, allowNull: false },
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
		await queryInterface.dropTable('IssueAttachments');
	},
};
