'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('InvoiceCsvImports');

    if (!tableInfo.status) {
      await queryInterface.addColumn('InvoiceCsvImports', 'status', {
        type: Sequelize.ENUM('DUPLICATE', 'FAILED', 'RESULT'),
        allowNull: true,
        defaultValue: 'RESULT',
      });
    }

    if (!tableInfo.porting_status) {
      await queryInterface.addColumn('InvoiceCsvImports', 'porting_status', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('InvoiceCsvImports');

    if (tableInfo.status) {
      await queryInterface.removeColumn('InvoiceCsvImports', 'status');
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_InvoiceCsvImports_status";');
    }

    if (tableInfo.porting_status) {
      await queryInterface.removeColumn('InvoiceCsvImports', 'porting_status');
    }
  },
};
