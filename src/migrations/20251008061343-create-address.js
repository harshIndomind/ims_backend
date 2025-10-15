'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Addresses', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      partner_id: {
        type: Sequelize.BIGINT
      },
      type: {
        type: Sequelize.ENUM('billing', 'shipping')
      },
      address1: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      address2: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      landmark: {
        type: Sequelize.STRING(150),
        allowNull: true
      },
      country: {
        type: Sequelize.STRING(100)
      },
      state: {
        type: Sequelize.STRING(100)
      },
      city: {
        type: Sequelize.STRING(100)
      },
      pincode: {
        type: Sequelize.STRING(6)
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Addresses');
  }
};