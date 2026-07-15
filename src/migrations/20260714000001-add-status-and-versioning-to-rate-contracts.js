'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('RateContracts', 'status', {
			type: Sequelize.ENUM('draft', 'approved', 'superseded', 'expired', 'cancelled'),
			allowNull: false,
			defaultValue: 'draft',
		});
		await queryInterface.addColumn('RateContracts', 'family_number', {
			type: Sequelize.STRING(50),
			allowNull: true,
		});
		await queryInterface.addColumn('RateContracts', 'version_number', {
			type: Sequelize.INTEGER,
			allowNull: false,
			defaultValue: 1,
		});
		// Points to the RC this was derived from (null for first versions)
		await queryInterface.addColumn('RateContracts', 'parent_rc_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});
		// Set after a newer version is approved — navigation pointer only, no FK constraint
		await queryInterface.addColumn('RateContracts', 'superseded_by_rc_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});
		await queryInterface.addColumn('RateContracts', 'approved_at', {
			type: Sequelize.DATE,
			allowNull: true,
		});
		await queryInterface.addColumn('RateContracts', 'approved_by', {
			type: Sequelize.JSON,
			allowNull: true,
		});

		// Backfill: existing RCs were already in use so treat them as approved V1 records.
		// family_number uses LPAD so RC-1 becomes RC-0001 for consistent sorting.
		await queryInterface.sequelize.query(`
			UPDATE RateContracts
			SET
				status = 'approved',
				family_number = CONCAT('RC-', LPAD(CAST(id AS CHAR), 4, '0')),
				version_number = 1
		`);
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('RateContracts', 'status');
		await queryInterface.removeColumn('RateContracts', 'family_number');
		await queryInterface.removeColumn('RateContracts', 'version_number');
		await queryInterface.removeColumn('RateContracts', 'parent_rc_id');
		await queryInterface.removeColumn('RateContracts', 'superseded_by_rc_id');
		await queryInterface.removeColumn('RateContracts', 'approved_at');
		await queryInterface.removeColumn('RateContracts', 'approved_by');
	},
};
