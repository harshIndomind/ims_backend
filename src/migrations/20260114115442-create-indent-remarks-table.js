'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('IndentRemarks', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			remarks: {
				type: Sequelize.STRING(200),
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
		await queryInterface.dropTable('IndentRemarks');
	},
};
