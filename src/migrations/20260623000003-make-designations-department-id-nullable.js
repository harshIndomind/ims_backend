'use strict';

module.exports = {
  async up(queryInterface) {
    // changeColumn() with a `references` block adds a second FK instead of
    // altering the existing one on MySQL, so modify nullability via raw SQL.
    await queryInterface.sequelize.query(
      'ALTER TABLE designations MODIFY department_id INT NULL',
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE designations MODIFY department_id INT NOT NULL',
    );
  },
};
