'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('DocumentsUploads', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			user_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'Users',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			doc_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'docs_categories',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			doc_number: { type: Sequelize.STRING, allowNull: false, unique: true },
			org_filename: { type: Sequelize.STRING, allowNull: false },
			generated_filename: { type: Sequelize.STRING, allowNull: false },
			uploaded_path: { type: Sequelize.STRING, allowNull: false },
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
		await queryInterface.dropTable('DocumentsUploads');
	},
};
