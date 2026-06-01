'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('PaymentRequisitions', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'organizations',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			requisition_no: {
				type: Sequelize.STRING(50),
				allowNull: true,
			},
			requisition_date: {
				type: Sequelize.DATE,
				allowNull: false,
			},
			requisition_against: {
				type: Sequelize.ENUM('WO', 'PO', 'Invoice'),
				allowNull: false,
				defaultValue: 'WO',
			},
			supplier_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			wo_no: {
				type: Sequelize.STRING(100),
				allowNull: true,
			},
			po_wo_date: {
				type: Sequelize.DATE,
				allowNull: true,
			},
			wo_po_amount: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: true,
				defaultValue: 0,
			},
			requisition_value_percent: {
				type: Sequelize.DECIMAL(5, 2),
				allowNull: false,
				defaultValue: 0,
			},
			requisition_amount: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			tds_percent: {
				type: Sequelize.DECIMAL(5, 2),
				allowNull: false,
				defaultValue: 0,
			},
			tds_amount: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			total_amount: {
				type: Sequelize.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			project_code: {
				type: Sequelize.STRING(100),
				allowNull: true,
			},
			project_name: {
				type: Sequelize.STRING(255),
				allowNull: true,
			},
			activity_id: {
				type: Sequelize.STRING(100),
				allowNull: true,
			},
			budget_id: {
				type: Sequelize.STRING(100),
				allowNull: true,
			},
			fed_by_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			fed_by: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			authorized_by_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			authorized_by: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			payment_date: {
				type: Sequelize.DATE,
				allowNull: true,
			},
			remark: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			term_condition: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			status: {
				type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED'),
				allowNull: false,
				defaultValue: 'PENDING',
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
		await queryInterface.dropTable('PaymentRequisitions');
	},
};
