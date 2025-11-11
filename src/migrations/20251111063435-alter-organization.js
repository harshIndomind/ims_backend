'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('organizations', 'state_id', {
			type: Sequelize.INTEGER,
			references: {
				model: 'GstStateCodes',
				key: 'id',
			},
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
			allowNull: true,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('organizations', 'state_id');
	},
};
