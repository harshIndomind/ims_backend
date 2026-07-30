'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('PurchaseOrders', 'dispatch_status', {
      type: Sequelize.ENUM('not_dispatched', 'dispatched', 'acknowledged'),
      allowNull: false,
      defaultValue: 'not_dispatched',
    });
    await queryInterface.addColumn('PurchaseOrders', 'last_dispatched_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('PurchaseOrders', 'last_acknowledged_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('PurchaseOrders', 'last_acknowledged_at');
    await queryInterface.removeColumn('PurchaseOrders', 'last_dispatched_at');
    await queryInterface.removeColumn('PurchaseOrders', 'dispatch_status');
  },
};
