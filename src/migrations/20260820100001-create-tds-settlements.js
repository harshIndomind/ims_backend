'use strict';

/**
 * Creates the TdsSettlements table — one row per government TDS deposit/challan.
 * A settlement can cover multiple TdsLiabilities (see TdsSettlementAllocations),
 * possibly only partially. Settlements are never edited in place once created;
 * a mistake is corrected via the /reverse endpoint (status -> REVERSED), which
 * preserves the row and its allocations for audit rather than deleting them.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const tableExists = await queryInterface.tableExists('TdsSettlements');

		if (!tableExists) {
			await queryInterface.createTable('TdsSettlements', {
				id: {
					allowNull: false,
					autoIncrement: true,
					primaryKey: true,
					type: Sequelize.INTEGER,
				},
				org_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'organizations', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'CASCADE',
				},
				settlement_date: {
					type: Sequelize.DATEONLY,
					allowNull: false,
				},
				challan_number: {
					type: Sequelize.STRING(100),
					allowNull: true,
				},
				total_amount: {
					type: Sequelize.DECIMAL(15, 2),
					allowNull: false,
					defaultValue: 0,
				},
				payment_mode: {
					type: Sequelize.STRING(50),
					allowNull: true,
				},
				bank_reference: {
					type: Sequelize.STRING(100),
					allowNull: true,
				},
				remarks: {
					type: Sequelize.TEXT,
					allowNull: true,
				},
				status: {
					type: Sequelize.ENUM('ACTIVE', 'REVERSED'),
					allowNull: false,
					defaultValue: 'ACTIVE',
				},
				reversed_at: {
					type: Sequelize.DATE,
					allowNull: true,
				},
				reversed_by_id: {
					type: Sequelize.INTEGER,
					allowNull: true,
				},
				reversal_reason: {
					type: Sequelize.TEXT,
					allowNull: true,
				},
				created_by_id: {
					type: Sequelize.INTEGER,
					allowNull: true,
				},
				updated_by_id: {
					type: Sequelize.INTEGER,
					allowNull: true,
				},
				createdAt: {
					allowNull: false,
					type: Sequelize.DATE,
				},
				updatedAt: {
					allowNull: false,
					type: Sequelize.DATE,
				},
			});
		}

		const indexes = await queryInterface.showIndex('TdsSettlements');
		const indexNames = indexes.map((i) => i.name);

		if (!indexNames.includes('idx_tds_settle_org_date')) {
			await queryInterface.addIndex('TdsSettlements', ['org_id', 'settlement_date'], {
				name: 'idx_tds_settle_org_date',
			});
		}
		if (!indexNames.includes('idx_tds_settle_org_challan')) {
			await queryInterface.addIndex('TdsSettlements', ['org_id', 'challan_number'], {
				name: 'idx_tds_settle_org_challan',
			});
		}
	},

	async down(queryInterface) {
		await queryInterface.dropTable('TdsSettlements');
	},
};
