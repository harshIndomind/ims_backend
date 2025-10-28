'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('GstStateCodes', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      country_id: {
        type: Sequelize.INTEGER,
        references: {
					model: 'Countries',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
      },
      gst_code: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
      },
      gst_code_padded: {
        type: Sequelize.CHAR(2),
        allowNull: false,
      },
      state_name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      notes: {
        type: Sequelize.STRING(255),
        allowNull: true,
        defaultValue: null,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('GstStateCodes');
  },
};
