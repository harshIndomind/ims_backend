'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Users', 'unit_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'MasterUnits',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Users', 'unit_id');
  },
};
