'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('order_documents', 'context', {
      type: Sequelize.ENUM('dispatch', 'acknowledgement', 'qc'),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('order_documents', 'context', {
      type: Sequelize.ENUM('dispatch', 'acknowledgement'),
      allowNull: false,
    });
  },
};
