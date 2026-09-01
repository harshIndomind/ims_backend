'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('MasterSubHeadCostCenterAmounts', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'organizations', key: 'id' },
			},
			sub_head_amount_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'MasterSubHeadAmounts',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
				allowNull: false,
			},
			major_head_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'MasterMajorHeads',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
				allowNull: false,
			},
			sub_head_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'MasterSubHeads',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
				allowNull: false,
			},
			period_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'MasterPeriods',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
				allowNull: false,
			},
			cost_center_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'cost_centers',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
				allowNull: false,
			},
			amount: {
				type: Sequelize.DECIMAL(12, 2),
				allowNull: false,
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

		// One allocation per cost centre per sub-head-amount — mirrors the
		// (major_head, period, sub_head) uniqueness on MasterSubHeadAmounts one level down.
		// No COALESCE(org_id,...) trick needed here: sub_head_amount_id is NOT NULL and
		// already identifies a single org-scoped parent row.
		await queryInterface.addIndex('MasterSubHeadCostCenterAmounts', {
			fields: ['sub_head_amount_id', 'cost_center_id'],
			unique: true,
			name: 'master_sub_head_cost_center_amounts_parent_cost_center_unique',
		});
	},
	async down(queryInterface) {
		await queryInterface.dropTable('MasterSubHeadCostCenterAmounts');
	},
};
