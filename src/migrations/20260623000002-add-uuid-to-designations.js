'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('designations', 'uuid', {
			type: Sequelize.CHAR(36),
			allowNull: true,
			after: 'id',
		});

		// Designations already synced from HRMS share the same desCd across all 3
		// services' databases. Deriving the uuid from desCd (instead of a random
		// UUID()) means every service computes the SAME value independently —
		// required so the new designation.* sync events can match existing rows
		// across services by uuid. Manually-created designations never existed
		// elsewhere, so a random uuid is correct for them.
		await queryInterface.sequelize.query(`
			UPDATE designations
			SET uuid = CONCAT(
				SUBSTRING(MD5(CONCAT('designation_v1_', desCd)), 1, 8), '-',
				SUBSTRING(MD5(CONCAT('designation_v1_', desCd)), 9, 4), '-',
				SUBSTRING(MD5(CONCAT('designation_v1_', desCd)), 13, 4), '-',
				SUBSTRING(MD5(CONCAT('designation_v1_', desCd)), 17, 4), '-',
				SUBSTRING(MD5(CONCAT('designation_v1_', desCd)), 21, 12)
			)
			WHERE uuid IS NULL AND desCd IS NOT NULL AND desCd != 0
		`);

		await queryInterface.sequelize.query(`
			UPDATE designations SET uuid = UUID() WHERE uuid IS NULL
		`);

		await queryInterface.changeColumn('designations', 'uuid', {
			type: Sequelize.CHAR(36),
			allowNull: false,
		});

		await queryInterface.addIndex('designations', ['uuid'], {
			unique: true,
			name: 'idx_designations_uuid_unique',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeIndex('designations', 'idx_designations_uuid_unique');
		await queryInterface.removeColumn('designations', 'uuid');
	},
};
