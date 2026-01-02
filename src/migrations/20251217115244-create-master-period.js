'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('MasterPeriods', {
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
			// major_code_id: {
			// 	type: Sequelize.INTEGER,
			// 	allowNull: false,
			// 	references: {
			// 		model: 'MasterMajorHeads',
			// 		key: 'id'
			// 	},
			// 	onDelete: 'CASCADE',
			// 	onUpdate: 'CASCADE',
			// },
			period_code: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			period: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			period_detail: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			period_short: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			is_lock: {
				type: Sequelize.BOOLEAN,
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
		await queryInterface.dropTable('MasterPeriods');
	},
};
