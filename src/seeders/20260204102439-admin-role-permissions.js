'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const permissions = await queryInterface.sequelize.query(
      `SELECT id FROM Permissions`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const rolePermissions = permissions.map((p) => ({
      role_id: 1, // Super Admin
      permission_id: p.id,
    }));

    await queryInterface.bulkInsert(
      'role_permissions',
      rolePermissions,
      {}
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete(
      'role_permissions',
      { role_id: 1 },
      {}
    );
  },
};
