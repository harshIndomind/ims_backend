'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('MasterTermCategories', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      category_name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      category_code: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        allowNull: true,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // await queryInterface.bulkInsert('MasterTermCategories', [
    //   {
    //     category_name: 'Non-Disclosure Agreement',
    //     category_code: 'NDA',
    //     description: 'Confidentiality terms',
    //     createdAt: new Date(),
    //     updatedAt: new Date(),
    //   },
    //   {
    //     category_name: 'Service Level Agreement',
    //     category_code: 'SLA',
    //     description: 'Service performance terms',
    //     createdAt: new Date(),
    //     updatedAt: new Date(),
    //   },
    //   {
    //     category_name: 'Privacy Policy',
    //     category_code: 'PP',
    //     description: 'Data privacy terms',
    //     createdAt: new Date(),
    //     updatedAt: new Date(),
    //   },
    //   {
    //     category_name: 'Terms of Service',
    //     category_code: 'TOS',
    //     description: 'General terms of service',
    //     createdAt: new Date(),
    //     updatedAt: new Date(),
    //   },
    // ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('MasterTermCategories');
  },
};