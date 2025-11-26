'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Remove the unique index (replace the name after checking SHOW INDEX)
    await queryInterface.removeIndex('ProductSerials', 'product_id');

    // Update column definition
    await queryInterface.changeColumn('ProductSerials', 'product_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      unique: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('ProductSerials', 'product_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      unique: true,
    });

    // await queryInterface.addIndex('ProductSerials', ['product_id'], {
    //   name: 'product_id_2',
    //   unique: true,
    // });
  }
};
