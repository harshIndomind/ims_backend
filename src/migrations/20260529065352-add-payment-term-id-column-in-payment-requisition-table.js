'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('PaymentRequisitions', 'payment_term_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: {
				model: 'MasterTermsConditions',
				key: 'id',
			},
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn('PaymentRequisitions', 'payment_term_id');
	},
};
