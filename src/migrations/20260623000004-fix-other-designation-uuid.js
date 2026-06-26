'use strict';

// 20260623000002-add-uuid-to-designations.js derived a deterministic uuid from
// desCd for every row EXCEPT desCd = 0, which fell back to a random UUID().
// The shared 'OTHER' placeholder designation uses desCd = 0 and exists
// identically in auth/scm/vcp, so each service ended up generating a
// DIFFERENT random uuid for the same logical row. That breaks the
// uuid-based user sync (designation_id silently resolves to null whenever a
// user's designation is 'OTHER'). Align it to AUTH's canonical value.
const AUTH_OTHER_DESIGNATION_UUID = '10835a54-6eee-11f1-925c-40ec9977a11e';

module.exports = {
  async up(queryInterface, Sequelize) {
    const rows = await queryInterface.sequelize.query(
      "SELECT id, uuid FROM designations WHERE desCd = 0 AND title = 'OTHER'",
      { type: Sequelize.QueryTypes.SELECT },
    );

    if (rows.length === 0) return;
    if (rows.length > 1) {
      throw new Error(
        `Expected exactly one desCd=0 'OTHER' designation, found ${rows.length}. Aborting to avoid assigning a duplicate uuid.`,
      );
    }
    if (rows[0].uuid === AUTH_OTHER_DESIGNATION_UUID) return;

    await queryInterface.sequelize.query(
      'UPDATE designations SET uuid = :uuid WHERE id = :id',
      { replacements: { uuid: AUTH_OTHER_DESIGNATION_UUID, id: rows[0].id } },
    );
  },

  async down() {
    // Not reversible — the original randomly-generated uuid isn't recoverable.
  },
};
