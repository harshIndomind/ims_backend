'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert(
      'designations',
      [
        {
          department_id: 1,
          title: 'Software Engineer',
          is_active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          department_id: 1,
          title: 'Senior Software Engineer',
          is_active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          department_id: 2,
          title: 'HR Executive',
          is_active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          department_id: 3,
          title: 'Accountant',
          is_active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      {}
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('designations', null, {});
  },
};
