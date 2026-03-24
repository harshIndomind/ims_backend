'use strict';

const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approver'];

module.exports = {
  async up(queryInterface, Sequelize) {
    // ✅ Select ALL feature menus (root or child)
    const menus = await queryInterface.sequelize.query(
      `
      SELECT id, slug
      FROM Menus
      WHERE isActive = 1
        AND url IS NOT NULL
      `,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const permissions = [];

    menus.forEach((menu) => {
      ACTIONS.forEach((action) => {
        permissions.push({
          menu_id: menu.id,
          action,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
    });

    if (permissions.length) {
      await queryInterface.bulkInsert('Permissions', permissions, {});
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('Permissions', null, {});
  },
};
