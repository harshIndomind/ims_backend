'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('qc_inspections', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      org_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      document_type: {
        type: Sequelize.ENUM('purchase_order', 'work_order'),
        allowNull: false,
      },
      document_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      acknowledgement_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'order_acknowledgements', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      template_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'qc_templates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      qc_no: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      inspection_type: {
        type: Sequelize.ENUM('incoming'),
        allowNull: false,
        defaultValue: 'incoming',
      },
      status: {
        type: Sequelize.ENUM('pending', 'assigned', 'in_progress', 'completed', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      overall_result: {
        type: Sequelize.ENUM('pending', 'passed', 'partial', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      inspector_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      assigned_by: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      assigned_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      completed_at: {
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
      reinspection_of_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'qc_inspections', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
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

    await queryInterface.addIndex('qc_inspections', ['document_type', 'document_id'], {
      name: 'idx_qc_inspections_doc',
    });
    await queryInterface.addIndex('qc_inspections', ['org_id', 'status'], {
      name: 'idx_qc_inspections_org_status',
    });
    await queryInterface.addIndex('qc_inspections', ['acknowledgement_id'], {
      name: 'idx_qc_inspections_ack',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('qc_inspections');
  },
};
