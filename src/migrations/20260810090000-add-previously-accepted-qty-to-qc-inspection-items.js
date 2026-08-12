'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('qc_inspection_items', 'previously_accepted_qty', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
      after: 'previously_received_qty',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('qc_inspection_items', 'previously_accepted_qty');
  },
};
