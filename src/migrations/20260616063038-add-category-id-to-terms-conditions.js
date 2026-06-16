module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('MasterTermsConditions', 'category_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'MasterTermCategories',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('MasterTermsConditions', 'category_id');
  },
};