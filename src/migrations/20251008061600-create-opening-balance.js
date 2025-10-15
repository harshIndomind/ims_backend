'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('OpeningBalances', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      partner_id: {
        type: Sequelize.BIGINT
      },
      partner_type: {
        type: Sequelize.ENUM('vendor', 'customer')
      },
      balance_type: {
        type: Sequelize.ENUM('credit', 'debit')
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2)
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
    await queryInterface.dropTable('OpeningBalances');
  }
};