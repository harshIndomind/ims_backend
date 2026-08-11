'use strict';
/** @type {import('sequelize-cli').Migration} */
// MasterSubHeads is a paranoid (soft-delete) model, same as MasterMajorHeads. Unlike m_code,
// sh_code had real duplicates among currently-active rows (leftover from the old nested
// "Add Sub Head under Major Head" flow, which created a fresh row per major head instead of
// reusing one) — those were deduped (soft-deleted, keeping the earliest row per code) before
// this migration. Same generated-column trick as m_code: NULL for soft-deleted rows so MySQL's
// "NULLs are distinct in a unique index" behavior excludes them, while still enforcing
// uniqueness among active ones and allowing a code to be reused after deletion.
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.sequelize.query(`
			ALTER TABLE MasterSubHeads
			ADD COLUMN active_sh_code VARCHAR(255)
			GENERATED ALWAYS AS (CASE WHEN deletedAt IS NULL THEN sh_code ELSE NULL END) STORED
		`);

		await queryInterface.addIndex('MasterSubHeads', {
			fields: ['org_id', 'active_sh_code'],
			unique: true,
			name: 'idx_master_sub_heads_org_code_unique',
		});
	},
	async down(queryInterface) {
		await queryInterface.removeIndex('MasterSubHeads', 'idx_master_sub_heads_org_code_unique');
		await queryInterface.sequelize.query('ALTER TABLE MasterSubHeads DROP COLUMN active_sh_code');
	},
};
