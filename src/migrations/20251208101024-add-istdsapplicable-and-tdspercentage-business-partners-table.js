'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('BusinessPartners', 'isApplicableForTds', {
			type: Sequelize.BOOLEAN,
			defaultValue: false,
		});
		await queryInterface.addColumn('BusinessPartners', 'tds_percentage', {
			type: Sequelize.DECIMAL(10, 2),
			defaultValue: 0,
		});
		await queryInterface.addColumn('BusinessPartners', 'openSwayammOthersAccount', {
			type: Sequelize.BOOLEAN,
			defaultValue: false,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('BusinessPartners', 'isApplicableForTds');
		await queryInterface.removeColumn('BusinessPartners', 'tds_percentage');
		await queryInterface.removeColumn('BusinessPartners', 'openSwayammOthersAccount');
	},
};
