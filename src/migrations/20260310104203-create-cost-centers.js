'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('cost_centers', {
			id: {
				type: Sequelize.INTEGER,
				autoIncrement: true,
				primaryKey: true,
				allowNull: false,
			},
			org_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'organizations', key: 'id' },
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
			},
			code: {
				type: Sequelize.STRING(10),
				allowNull: false,
				unique: true,
			},

			name: {
				type: Sequelize.STRING(100),
				allowNull: false,
			},

			station_code: {
				type: Sequelize.STRING,
				allowNull: true,
			},

			account_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: {
					model: 'MasterAccounts',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
			},

			is_lock: {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},

			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
			updatedAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
			deletedAt: {
				type: Sequelize.DATE,
				allowNull: true,
			},
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('cost_centers');
	},
};
