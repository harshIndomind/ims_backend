'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('qc_template_items', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      qc_template_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'qc_templates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      sequence: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      parameter_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      parameter_type: {
        type: Sequelize.ENUM('boolean', 'numeric', 'text', 'pass_fail'),
        allowNull: false,
      },
      expected_value: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      tolerance_min: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: true,
      },
      tolerance_max: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: true,
      },
      unit: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      is_required: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex('qc_template_items', ['qc_template_id', 'sequence'], {
      name: 'idx_qc_template_items_template_seq',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('qc_template_items');
  },
};
