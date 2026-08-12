'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('qc_results', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      qc_inspection_item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'qc_inspection_items', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      qc_template_item_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'qc_template_items', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      observed_value: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      result: {
        type: Sequelize.ENUM('pass', 'fail', 'na'),
        allowNull: false,
        defaultValue: 'na',
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

    await queryInterface.addIndex('qc_results', ['qc_inspection_item_id'], {
      name: 'idx_qc_results_inspection_item',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('qc_results');
  },
};
