

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('MasterTermCategories', [
      {
        category_name: 'Non-Disclosure Agreement',
        category_code: 'NDA',
        description: 'Confidentiality terms',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        category_name: 'Service Level Agreement',
        category_code: 'SLA',
        description: 'Service performance terms',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        category_name: 'Privacy Policy',
        category_code: 'PP',
        description: 'Data privacy terms',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        category_name: 'Terms of Service',
        category_code: 'TOS',
        description: 'General terms of service',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      
       
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('MasterTermCategories', null, {});
  },
};