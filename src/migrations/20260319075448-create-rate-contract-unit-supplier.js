'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('RateContractUnitSuppliers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      rate_contract_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'RateContracts',
          key: 'id'
        },
        onDelete: 'CASCADE',
      },
      unit_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'MasterUnits',
          key: 'id'
        },
        onDelete: 'CASCADE',
      },
      supplier_id: {
        type: Sequelize.INTEGER
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
    await queryInterface.dropTable('RateContractUnitSuppliers');
  }
};