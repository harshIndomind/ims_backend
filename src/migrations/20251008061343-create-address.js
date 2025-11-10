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
        type: Sequelize.INTEGER
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
      country_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Countries',
          key: 'id',
        }
      },
      state_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'GstStateCodes',
          key: 'id',
        },
        allowNull: true
      },
      country: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      state: {
        type: Sequelize.STRING(100),
        allowNull: true
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