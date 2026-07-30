'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('WorkOrders', 'dispatch_status', {
      type: Sequelize.ENUM('not_dispatched', 'dispatched', 'acknowledged'),
      allowNull: false,
      defaultValue: 'not_dispatched',
    });
    await queryInterface.addColumn('WorkOrders', 'last_dispatched_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('WorkOrders', 'last_acknowledged_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('WorkOrders', 'last_acknowledged_at');
    await queryInterface.removeColumn('WorkOrders', 'last_dispatched_at');
    await queryInterface.removeColumn('WorkOrders', 'dispatch_status');
  },
};
