'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {

    // ── Step 1: Add uuid column ───────────────────────────
    await queryInterface.addColumn('organizations', 'uuid', {
      type:      Sequelize.CHAR(36),
      allowNull: true,
      after:     'id',
    });

    // ── Step 2: Fill UUID for all existing rows ───────────
    await queryInterface.sequelize.query(`
      UPDATE organizations SET uuid = UUID() WHERE uuid IS NULL
    `);

    // ── Step 3: Make NOT NULL + UNIQUE ────────────────────
    await queryInterface.changeColumn('organizations', 'uuid', {
      type:      Sequelize.CHAR(36),
      allowNull: false,
    });

    await queryInterface.addIndex('organizations', ['uuid'], {
      unique: true,
      name:   'idx_organizations_uuid_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('organizations', 'idx_organizations_uuid_unique');
    await queryInterface.removeColumn('organizations', 'uuid');
  },
};