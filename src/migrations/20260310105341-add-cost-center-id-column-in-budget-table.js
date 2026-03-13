module.exports = {
  async up(queryInterface, Sequelize) {

    await queryInterface.addColumn('Budgets', 'cost_center_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'cost_centers',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

  },

  async down(queryInterface, Sequelize) {

    await queryInterface.removeColumn('Budgets', 'cost_center_id');

  }
};