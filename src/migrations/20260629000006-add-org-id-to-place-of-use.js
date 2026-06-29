'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('MasterPlaceOfUses', 'org_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: { model: 'organizations', key: 'id' },
			onDelete: 'CASCADE',
			onUpdate: 'CASCADE',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('MasterPlaceOfUses', 'org_id');
	},
};
