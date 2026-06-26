

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('MasterTermCategories', [
      {
        category_name: 'Price Term',
        category_code: 'PRT',
        description: 'Pricing terms',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        category_name: 'GST Term',
        category_code: 'GT',
        description: 'Goods and Services Tax terms',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        category_name: 'Payment Term',
        category_code: 'PT',
        description: 'Payment terms',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        category_name: 'Delivery Term',
        category_code: 'DT',
        description: 'Delivery information',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        category_name: 'PF Term',
        category_code: 'PFT',
        description: ' Provident Fund terms',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        category_name: 'LD Clause Term',
        category_code: 'LDCT',
        description: 'Letter of Credit terms',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
        
       
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('MasterTermCategories', null, {});
  },
};