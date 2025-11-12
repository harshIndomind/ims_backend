'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('BusinessPartners', 'registration_type_id', {
			type: Sequelize.INTEGER,
			references: {
				model: 'RegistrationTypes',
				key: 'id',
			},
			onUpdate: 'CASCADE',
			onDelete: 'RESTRICT',
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('BusinessPartners', 'registration_type_id');
	},
};
