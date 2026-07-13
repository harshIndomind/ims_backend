'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('UserVisibilityMappings', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			user_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'Users', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			unit_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'MasterUnits', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			department_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'departments', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			created_by: {
				type: Sequelize.INTEGER,
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

		await queryInterface.addIndex('UserVisibilityMappings', ['user_id', 'unit_id', 'department_id'], {
			unique: true,
			name: 'uvm_user_unit_dept_unique',
		});

		await queryInterface.addIndex('UserVisibilityMappings', ['user_id'], {
			name: 'uvm_user_idx',
		});
	},

	async down(queryInterface) {
		await queryInterface.dropTable('UserVisibilityMappings');
	},
};
