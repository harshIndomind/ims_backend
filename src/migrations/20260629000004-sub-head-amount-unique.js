'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface) {
		// org_id is nullable. A plain unique index on
		// (org_id, major_head_id, period_id, sub_head_id) wouldn't enforce anything for
		// those rows since MySQL treats every NULL as distinct in a unique index, so
		// COALESCE(org_id, 0) collapses them into one bucket.
		await queryInterface.sequelize.query(
			'CREATE UNIQUE INDEX master_sub_head_amounts_org_majorhead_period_subhead_unique ON MasterSubHeadAmounts ((COALESCE(org_id, 0)), major_head_id, period_id, sub_head_id)',
		);
	},
	async down(queryInterface) {
		await queryInterface.sequelize.query(
			'DROP INDEX master_sub_head_amounts_org_majorhead_period_subhead_unique ON MasterSubHeadAmounts',
		);
	},
};
