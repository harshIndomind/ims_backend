'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('Indents', 'place_of_use_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: { model: 'MasterPlaceOfUses', key: 'id' },
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('Indents', 'place_of_use_id');
	},
};
