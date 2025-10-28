'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('OrganizationBankDetails', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      org_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'organizations',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      account_name: {
        type: Sequelize.STRING
      },
      bank_name: {
        type: Sequelize.STRING
      },
      bank_ifsc: {
        type: Sequelize.STRING
      },
      swift_code: {
        type: Sequelize.STRING,
        allowNull: true
      },
      micr_code: {
        type: Sequelize.STRING,
        allowNull: true
      },
      account_no: {
        type: Sequelize.STRING
      },
      branch_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      upi_id: {
        type: Sequelize.STRING,
        allowNull: true
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
    await queryInterface.dropTable('OrganizationBankDetails');
  }
};