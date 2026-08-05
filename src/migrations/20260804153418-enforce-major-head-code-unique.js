'use strict';
/** @type {import('sequelize-cli').Migration} */
// MasterMajorHeads is a paranoid (soft-delete) model, and prod already has soft-deleted rows
// sharing an m_code with an active row (e.g. org 1 / code "1"). A plain unique index on
// (org_id, m_code) would fail to create and would also block reusing a code after deletion.
// A generated column that's NULL for soft-deleted rows lets MySQL's "NULLs are distinct in a
// unique index" behavior exclude deleted rows from the constraint, while still enforcing
// uniqueness among active ones.
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.sequelize.query(`
			ALTER TABLE MasterMajorHeads
			ADD COLUMN active_m_code VARCHAR(255)
			GENERATED ALWAYS AS (CASE WHEN deletedAt IS NULL THEN m_code ELSE NULL END) STORED
		`);

		await queryInterface.addIndex('MasterMajorHeads', {
			fields: ['org_id', 'active_m_code'],
			unique: true,
			name: 'idx_master_major_heads_org_code_unique',
		});
	},
	async down(queryInterface) {
		await queryInterface.removeIndex('MasterMajorHeads', 'idx_master_major_heads_org_code_unique');
		await queryInterface.sequelize.query('ALTER TABLE MasterMajorHeads DROP COLUMN active_m_code');
	},
};
