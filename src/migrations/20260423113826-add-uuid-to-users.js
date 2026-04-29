'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {

    // ── Step 1: Add uuid column ───────────────────────────
    await queryInterface.addColumn('Users', 'uuid', {
      type:         Sequelize.CHAR(36),
      allowNull:    true,   // nullable first — will fill then make NOT NULL
      after:        'id',
    });

    // ── Step 2: Fill UUID for all existing rows ───────────
    await queryInterface.sequelize.query(`
      UPDATE Users SET uuid = UUID() WHERE uuid IS NULL
    `);

    // ── Step 3: Make NOT NULL + UNIQUE ────────────────────
    await queryInterface.changeColumn('Users', 'uuid', {
      type:      Sequelize.CHAR(36),
      allowNull: false,
    });

    await queryInterface.addIndex('Users', ['uuid'], {
      unique: true,
      name:   'idx_users_uuid_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('Users', 'idx_users_uuid_unique');
    await queryInterface.removeColumn('Users', 'uuid');
  },
};