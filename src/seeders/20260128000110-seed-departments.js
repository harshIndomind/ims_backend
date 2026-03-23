'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert(
      'departments',
      [
        {
          name: 'Engineering',
          description: 'Software & Technical Department',
          is_active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Human Resources',
          description: 'Employee Management',
          is_active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Finance',
          description: 'Accounts & Finance',
          is_active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      {}
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('departments', null, {});
  },
};
