'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('ResetPasswords', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			userId: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'Users',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			token: { type: Sequelize.STRING(256), allowNull: false },
			expiresAt: { type: Sequelize.DATE, allowNull: false },
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
			updatedAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
		});
		await queryInterface.addIndex('ResetPasswords', ['token']);
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('ResetPasswords');
	},
};
