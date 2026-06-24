'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('departments', 'uuid', {
			type: Sequelize.CHAR(36),
			allowNull: true,
			after: 'id',
		});

		// Departments already synced from HRMS share the same (depCd, unitCd) pair
		// across all 3 services' databases. Deriving the uuid from that composite key
		// (instead of a random UUID()) means every service computes the SAME value
		// independently — required so the new department.* sync events can match
		// existing rows across services by uuid. Manually-created departments never
		// existed elsewhere, so a random uuid is correct for them.
		await queryInterface.sequelize.query(`
			UPDATE departments
			SET uuid = CONCAT(
				SUBSTRING(MD5(CONCAT('department_v1_', depCd, '_', unitCd)), 1, 8), '-',
				SUBSTRING(MD5(CONCAT('department_v1_', depCd, '_', unitCd)), 9, 4), '-',
				SUBSTRING(MD5(CONCAT('department_v1_', depCd, '_', unitCd)), 13, 4), '-',
				SUBSTRING(MD5(CONCAT('department_v1_', depCd, '_', unitCd)), 17, 4), '-',
				SUBSTRING(MD5(CONCAT('department_v1_', depCd, '_', unitCd)), 21, 12)
			)
			WHERE uuid IS NULL AND depCd IS NOT NULL AND unitCd IS NOT NULL
		`);

		await queryInterface.sequelize.query(`
			UPDATE departments SET uuid = UUID() WHERE uuid IS NULL
		`);

		await queryInterface.changeColumn('departments', 'uuid', {
			type: Sequelize.CHAR(36),
			allowNull: false,
		});

		await queryInterface.addIndex('departments', ['uuid'], {
			unique: true,
			name: 'idx_departments_uuid_unique',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeIndex('departments', 'idx_departments_uuid_unique');
		await queryInterface.removeColumn('departments', 'uuid');
	},
};
