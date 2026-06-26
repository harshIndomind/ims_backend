'use strict';

module.exports = {
  async up(queryInterface) {
    // Normalize blank employee codes to NULL first — MySQL's unique index
    // allows multiple NULLs but treats repeated '' as a collision, and a
    // handful of pre-existing users have '' rather than NULL.
    await queryInterface.sequelize.query(
      "UPDATE Users SET employee_code = NULL WHERE employee_code = ''",
    );

    await queryInterface.addConstraint('Users', {
      fields: ['employee_code'],
      type: 'unique',
      name: 'users_employee_code_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('Users', 'users_employee_code_unique');
  },
};
