'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('BusinessPartners', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      organization_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      type: {
        type: Sequelize.ENUM('vendor', 'customer', 'vendor_customer'),
				allowNull: false,
      },
      name: {
        type: Sequelize.STRING(150),
				allowNull: false,
      },
      code: {
        type: Sequelize.STRING(50),
				allowNull: false,
				unique: true,
      },
      contact_no: {
        type: Sequelize.STRING(20)
      },
      email: {
        type: Sequelize.TEXT
      },
      gstin: {
        type: Sequelize.STRING(30)
      },
      pan: {
        type: Sequelize.STRING(20)
      },
      registration_type: {
        type: Sequelize.TINYINT
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      created_by: {
        type: Sequelize.BIGINT
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
    await queryInterface.dropTable('BusinessPartners');
  }
};