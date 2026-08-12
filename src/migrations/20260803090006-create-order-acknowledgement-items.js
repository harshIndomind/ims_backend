'use strict';
/**
 * Optional line-item extension to order_acknowledgements — captures how much of each PO/WO
 * line physically arrived. Only populated when the order's po_qc_check/wo_qc_check flag is
 * true; the existing document-level-only acknowledge flow for non-QC orders is untouched.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_acknowledgement_items', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      acknowledgement_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'order_acknowledgements', key: 'id' },
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
      batch_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      stock_type: {
        type: Sequelize.ENUM('normal', 'batch', 'serial'),
        allowNull: true,
      },
      arrived_qty: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },
      damage_notes: {
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

    await queryInterface.addIndex('order_acknowledgement_items', ['acknowledgement_id'], {
      name: 'idx_order_ack_items_ack',
    });
    await queryInterface.addIndex('order_acknowledgement_items', ['po_wo_item_id'], {
      name: 'idx_order_ack_items_po_wo_item',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('order_acknowledgement_items');
  },
};
