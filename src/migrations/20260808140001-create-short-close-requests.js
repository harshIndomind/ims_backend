'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('short_close_requests', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      org_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      request_no: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      // Matches qc_inspections' document_type values exactly (purchase_order/work_order) — the
      // remaining-qty math in qc-inspection.service.js and short-close.service.js must agree on
      // this string byte-for-byte since both key off it.
      document_type: {
        type: Sequelize.ENUM('purchase_order', 'work_order'),
        allowNull: false,
      },
      document_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      // Mirrors workflow_instances.status exactly — this row's status is always a direct copy
      // of the workflow instance's status (see short-close.service.js), same pattern PO/WO/QC
      // already use, rather than a second parallel status vocabulary.
      status: {
        type: Sequelize.ENUM('draft', 'in_progress', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft',
      },
      reason_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'MasterShortCloseReasons',
          key: 'id',
        },
      },
      remarks: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      requested_by: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      requested_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      approved_by: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      approved_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('short_close_requests', ['document_type', 'document_id'], {
      name: 'short_close_requests_document_idx',
    });
    await queryInterface.addIndex('short_close_requests', ['org_id', 'status'], {
      name: 'short_close_requests_org_status_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('short_close_requests');
  },
};
