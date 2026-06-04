'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('MasterSubHeads', 'major_head_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: {
				model: 'MasterMajorHeads',
				key: 'id',
			},
			onDelete: 'SET NULL',
			onUpdate: 'CASCADE',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('MasterSubHeads', 'major_head_id');
	},
};
