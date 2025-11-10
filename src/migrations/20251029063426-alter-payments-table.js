'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('Payments', 'advAmount', {
			type: Sequelize.DECIMAL(15, 2),
			allowNull: true,
		});
    await queryInterface.addColumn('Payments', 'transaction_id', {
			type: Sequelize.STRING,
			allowNull: true,
		});
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Payments', 'advAmount');
    await queryInterface.removeColumn('Payments', 'transaction_id');
  }
};
