'use strict';

const { all } = require('axios');

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('Budgets', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			budgetType: {
				type: Sequelize.ENUM('item-wise', 'value-wise'),
			},
			org_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'organizations',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			budget_id: {
				type: Sequelize.STRING(50),
				allowNull: true,
			},
			indent: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			unit_id: {
				type: Sequelize.STRING(50),
				allowNull: true,
			},
			department_id: {
				type: Sequelize.STRING(50),
				allowNull: true,
			},
			date: {
				type: Sequelize.DATE,
				allowNull: true,
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
			major_head_amount_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'MasterMajorHeadAmounts',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
				allowNull: false,
			},
			sub_head_amount_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'MasterSubHeadAmounts',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
				allowNull: true,
			},
			budget_head_id: {
				type: Sequelize.STRING(50),
				allowNull: true,
			},
			product_id: {
				type: Sequelize.STRING(50),
				allowNull: true,
			},
			stncode: {
				type: Sequelize.STRING(20),
				allowNull: true,
			},
			stnname: {
				type: Sequelize.STRING(255),
				allowNull: true,
			},
			iuom: {
				type: Sequelize.STRING(50),
				allowNull: true,
			},
			qty_for_purchase: {
				type: Sequelize.DOUBLE,
				allowNull: true,
			},
			amount: {
				type: Sequelize.DOUBLE,
				allowNull: true,
			},
			average_rate: {
				type: Sequelize.DOUBLE,
				allowNull: true,
			},
			first_phase_qty: {
				type: Sequelize.DOUBLE,
				allowNull: true,
			},
			first_phase_date: {
				type: Sequelize.DATE,
				allowNull: true,
			},
			second_phase_qty: {
				type: Sequelize.DOUBLE,
				allowNull: true,
			},
			second_phase_date: {
				type: Sequelize.DATE,
				allowNull: true,
			},
			third_phase_qty: {
				type: Sequelize.DOUBLE,
				allowNull: true,
			},
			third_phase_date: {
				type: Sequelize.DATE,
				allowNull: true,
			},
			sanc_by: {
				type: Sequelize.ENUM('yes', 'no'),
				allowNull: true,
				defaultValue: 'no',
			},
			category: {
				type: Sequelize.STRING(50),
				allowNull: true,
			},
			remarks: {
				type: Sequelize.STRING(200),
				allowNull: true,
			},
			is_lock: {
				type: Sequelize.BOOLEAN,
				defaultValue: true,
			},
			active_ph: {
				type: Sequelize.TINYINT,
				allowNull: true,
			},
			value_wise: {
				type: Sequelize.TINYINT,
				allowNull: true,
			},
			tax_duty_value_percentage: {
				type: Sequelize.DOUBLE,
				allowNull: true,
			},
			tax_duty_amount: {
				type: Sequelize.DOUBLE,
				allowNull: true,
			},
			lup_date: {
				type: Sequelize.DATE,
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
	},

	async down(queryInterface) {
		await queryInterface.dropTable('Budgets');
	},
};
