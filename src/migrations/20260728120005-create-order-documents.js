'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_documents', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      document_type: {
        type: Sequelize.ENUM('purchase_order', 'work_order'),
        allowNull: false,
      },
      document_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      context: {
        type: Sequelize.ENUM('dispatch', 'acknowledgement'),
        allowNull: false,
      },
      context_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      file_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      file_key: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      file_type: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      file_size: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      storage_type: {
        type: Sequelize.ENUM('s3', 'local'),
        allowNull: false,
        defaultValue: 's3',
      },
      uploaded_by: {
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

    await queryInterface.addIndex('order_documents', ['context', 'context_id'], {
      name: 'idx_order_documents_ctx',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('order_documents');
  },
};
