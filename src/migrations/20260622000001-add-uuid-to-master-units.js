'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('MasterUnits', 'uuid', {
			type: Sequelize.CHAR(36),
			allowNull: true,
			after: 'id',
		});

		// Units already synced from HRMS share the same unitCd across all 3 services'
		// databases. Deriving the uuid from unitCd (instead of a random UUID()) means
		// every service computes the SAME value independently — required so the new
		// master_unit.* sync events can match existing rows across services by uuid.
		// Manually-created units (unitCd null/0) never existed elsewhere, so a random
		// uuid is correct for them.
		await queryInterface.sequelize.query(`
			UPDATE MasterUnits
			SET uuid = CONCAT(
				SUBSTRING(MD5(CONCAT('master_unit_v1_', unitCd)), 1, 8), '-',
				SUBSTRING(MD5(CONCAT('master_unit_v1_', unitCd)), 9, 4), '-',
				SUBSTRING(MD5(CONCAT('master_unit_v1_', unitCd)), 13, 4), '-',
				SUBSTRING(MD5(CONCAT('master_unit_v1_', unitCd)), 17, 4), '-',
				SUBSTRING(MD5(CONCAT('master_unit_v1_', unitCd)), 21, 12)
			)
			WHERE uuid IS NULL AND unitCd IS NOT NULL AND unitCd != 0
		`);

		await queryInterface.sequelize.query(`
			UPDATE MasterUnits SET uuid = UUID() WHERE uuid IS NULL
		`);

		await queryInterface.changeColumn('MasterUnits', 'uuid', {
			type: Sequelize.CHAR(36),
			allowNull: false,
		});

		await queryInterface.addIndex('MasterUnits', ['uuid'], {
			unique: true,
			name: 'idx_master_units_uuid_unique',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeIndex('MasterUnits', 'idx_master_units_uuid_unique');
		await queryInterface.removeColumn('MasterUnits', 'uuid');
	},
};
