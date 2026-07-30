'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_acknowledgements', {
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
      dispatch_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'order_dispatches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      acknowledged_by_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      acknowledgement_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      acknowledgement_mode_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'MasterAcknowledgementModes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      vendor_reference_no: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      remarks: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      recorded_by: {
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

    await queryInterface.addIndex('order_acknowledgements', ['document_type', 'document_id'], {
      name: 'idx_order_acks_doc',
    });
    await queryInterface.addIndex('order_acknowledgements', ['dispatch_id'], {
      name: 'idx_order_acks_dispatch',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('order_acknowledgements');
  },
};
