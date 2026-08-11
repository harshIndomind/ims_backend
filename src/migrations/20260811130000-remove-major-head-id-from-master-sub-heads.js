'use strict';

// major_head_id on MasterSubHeads was a leftover from the old design where a sub head
// belonged to exactly one major head. That model was replaced by MasterSubHeadAmount
// (major_head_id + period_id + sub_head_id), which lets a sub head be linked to many
// major heads. No service/controller ever reads or writes MasterSubHeads.major_head_id.
module.exports = {
	async up(queryInterface) {
		await queryInterface.removeColumn('MasterSubHeads', 'major_head_id');
	},

	async down(queryInterface, Sequelize) {
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
};
