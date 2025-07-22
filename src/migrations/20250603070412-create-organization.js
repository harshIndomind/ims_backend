'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('organizations', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_name: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			org_code: {
				type: Sequelize.STRING,
				allowNull: false,
				unique: true
			},
			org_email: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			org_person_name: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			org_person_contact: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			org_address: {
				type: Sequelize.STRING,
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
		await queryInterface.dropTable('organizations');
	},
};
