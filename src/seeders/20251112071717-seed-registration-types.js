'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('RegistrationTypes', [
      { type: 'Regular', createdAt: new Date(), updatedAt: new Date() },
      { type: 'Unregistered', createdAt: new Date(), updatedAt: new Date() },
      { type: 'Regular-SEZ', createdAt: new Date(), updatedAt: new Date() },
      { type: 'Regular-Embassy/UN', createdAt: new Date(), updatedAt: new Date() },
      { type: 'Composition', createdAt: new Date(), updatedAt: new Date() },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('RegistrationTypes', null, {});
  }
};
