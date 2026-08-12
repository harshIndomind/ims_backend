'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('qc_inspection_items', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      qc_inspection_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'qc_inspections', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      po_wo_item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      productSnapshot: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      batch_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      batchSnapshot: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      stock_type: {
        type: Sequelize.ENUM('normal', 'batch', 'serial'),
        allowNull: true,
      },
      arrived_qty: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      inspected_qty: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      accepted_qty: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      rejected_qty: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      rework_qty: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      result: {
        type: Sequelize.ENUM('pending', 'passed', 'partial', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      rejection_reason_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'MasterQcRejectionReasons', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      remarks: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      serial_nos: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      rejected_serial_nos: {
        type: Sequelize.JSON,
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

    await queryInterface.addIndex('qc_inspection_items', ['qc_inspection_id']);
    await queryInterface.addIndex('qc_inspection_items', ['po_wo_item_id'], {
      name: 'idx_qc_inspection_items_po_wo_item',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('qc_inspection_items');
  },
};
