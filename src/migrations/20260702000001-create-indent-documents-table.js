'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('IndentDocuments', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			indent_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'Indents',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			file_name: {
				type: Sequelize.STRING(255),
				allowNull: false,
			},
			file_key: {
				type: Sequelize.STRING(500),
				allowNull: false,
			},
			file_type: {
				type: Sequelize.STRING(100),
				allowNull: false,
			},
			file_size: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			storage_type: {
				type: Sequelize.ENUM('s3', 'local'),
				defaultValue: 's3',
			},
			uploaded_by: {
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
	},

	async down(queryInterface) {
		await queryInterface.dropTable('IndentDocuments');
	},
};
