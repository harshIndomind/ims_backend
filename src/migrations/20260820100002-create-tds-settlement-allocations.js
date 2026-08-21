'use strict';

/**
 * Creates the TdsSettlementAllocations table — the junction between one
 * TdsSettlement (a single government payment/challan) and the one or more
 * TdsLiabilities it settles, each with its own allocated_amount so a single
 * challan can partially settle several liabilities at once.
 *
 * The unique (tds_settlement_id, tds_liability_id) pair means a liability can
 * only be allocated once per settlement — to change the amount, update this
 * row's allocated_amount rather than inserting a duplicate.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const tableExists = await queryInterface.tableExists('TdsSettlementAllocations');

		if (!tableExists) {
			await queryInterface.createTable('TdsSettlementAllocations', {
				id: {
					allowNull: false,
					autoIncrement: true,
					primaryKey: true,
					type: Sequelize.INTEGER,
				},
				tds_settlement_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'TdsSettlements', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'CASCADE',
				},
				tds_liability_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'TdsLiabilities', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'RESTRICT',
				},
				allocated_amount: {
					type: Sequelize.DECIMAL(15, 2),
					allowNull: false,
					defaultValue: 0,
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

		const indexes = await queryInterface.showIndex('TdsSettlementAllocations');
		const indexNames = indexes.map((i) => i.name);

		if (!indexNames.includes('uq_tds_alloc_settlement_liability')) {
			await queryInterface.addIndex('TdsSettlementAllocations', ['tds_settlement_id', 'tds_liability_id'], {
				name: 'uq_tds_alloc_settlement_liability',
				unique: true,
			});
		}
		if (!indexNames.includes('idx_tds_alloc_liability_id')) {
			await queryInterface.addIndex('TdsSettlementAllocations', ['tds_liability_id'], {
				name: 'idx_tds_alloc_liability_id',
			});
		}
	},

	async down(queryInterface) {
		await queryInterface.dropTable('TdsSettlementAllocations');
	},
};
