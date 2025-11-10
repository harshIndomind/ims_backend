'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('Addresses', 'gstin', {
			type: Sequelize.STRING(15),
			allowNull: true,
		});
    await queryInterface.addColumn('Addresses', 'name', {
			type: Sequelize.STRING(150),
			allowNull: true,
		});
    await queryInterface.addColumn('Addresses', 'contact_person', {
			type: Sequelize.STRING(150),
			allowNull: true,
		});
    await queryInterface.addColumn('Addresses', 'phone', {
			type: Sequelize.STRING,
			allowNull: true,
		});
    await queryInterface.addColumn('Addresses', 'email', {
			type: Sequelize.STRING,
			allowNull: true,
		});
    await queryInterface.addColumn('Addresses', 'distance_km', {
			type: Sequelize.DECIMAL(10, 2),
			allowNull: true,
		});
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Addresses', 'gstin');
    await queryInterface.removeColumn('Addresses', 'name');
    await queryInterface.removeColumn('Addresses', 'contact_person');
    await queryInterface.removeColumn('Addresses', 'phone');
    await queryInterface.removeColumn('Addresses', 'email');
    await queryInterface.removeColumn('Addresses', 'distance_km');
  }
};
