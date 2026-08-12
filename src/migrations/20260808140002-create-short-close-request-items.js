'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('short_close_request_items', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      short_close_request_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'short_close_requests',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      // Polymorphic against purchase_order_items/work_order_items depending on the parent
      // request's document_type — same shape as qc_inspection_items.po_wo_item_id, no formal FK
      // constraint since it targets two different tables.
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
      // Snapshots taken at request-creation time, purely informational/for-display — approval
      // always re-validates against live figures, never trusts these.
      ordered_qty: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      accepted_qty: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      previously_short_closed_qty: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      short_close_qty: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },
      remarks: {
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

    await queryInterface.addIndex('short_close_request_items', ['po_wo_item_id'], {
      name: 'short_close_request_items_po_wo_item_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('short_close_request_items');
  },
};
