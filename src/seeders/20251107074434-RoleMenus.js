'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('RoleMenus', [
      { roleId: 2, menuId: 1, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 5, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 6, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 7, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 8, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 9, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 10, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 17, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 19, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 20, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 21, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 22, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 23, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 24, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 25, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 26, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 27, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 28, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 29, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },
      { roleId: 2, menuId: 30, createdAt: new Date('2025-11-06 11:05:15'), updatedAt: new Date('2025-11-06 11:05:15') },

      { roleId: 3, menuId: 1, createdAt: new Date('2025-11-06 10:32:35'), updatedAt: new Date('2025-11-06 10:32:35') },
      { roleId: 3, menuId: 14, createdAt: new Date('2025-11-06 10:32:35'), updatedAt: new Date('2025-11-06 10:32:35') },
      { roleId: 3, menuId: 15, createdAt: new Date('2025-11-06 10:32:35'), updatedAt: new Date('2025-11-06 10:32:35') },
      { roleId: 3, menuId: 16, createdAt: new Date('2025-11-06 10:32:35'), updatedAt: new Date('2025-11-06 10:32:35') },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('RoleMenus', null, {});
  }
};
