'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_dispatches', {
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
      dispatch_no: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      dispatch_method_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'MasterDispatchMethods', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      dispatch_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      recipient_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      recipient_email: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      reference_no: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      remarks: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      email_status: {
        type: Sequelize.ENUM('not_applicable', 'queued', 'sent', 'failed'),
        allowNull: false,
        defaultValue: 'not_applicable',
      },
      dispatched_by: {
        type: Sequelize.JSON,
        allowNull: false,
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

    await queryInterface.addIndex('order_dispatches', ['document_type', 'document_id'], {
      name: 'idx_order_dispatches_doc',
    });
    await queryInterface.addIndex('order_dispatches', ['org_id'], {
      name: 'idx_order_dispatches_org',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('order_dispatches');
  },
};
