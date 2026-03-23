'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('Users', {
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
			},
			employee_code: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			department_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: {
					model: 'departments',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'RESTRICT',
			},
			designation_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: {
					model: 'designations',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'RESTRICT',
			},
			layer: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			name: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			email: {
				type: Sequelize.STRING,
				unique: true,
				allowNull: false,
			},
			password: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			image: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			logo: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			roleId: {
				type: Sequelize.INTEGER,
				references: {
					model: 'Roles',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			},
			is_active: {
				type: Sequelize.BOOLEAN,
				defaultValue: false
			},
			last_login: {
				type: Sequelize.DATE,
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
	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('Users');
	},
};
