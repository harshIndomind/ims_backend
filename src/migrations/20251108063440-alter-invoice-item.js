'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('InvoiceItems', 'selected_uom_id', {
			type: Sequelize.INTEGER,
			references: {
				model: 'Units',
				key: 'id',
			},
			onUpdate: 'CASCADE', // optional but recommended
			onDelete: 'SET NULL', // optional but recommended
			allowNull: true,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('InvoiceItems', 'selected_uom_id');
	},
};
